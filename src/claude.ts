import Anthropic from "@anthropic-ai/sdk";
import { SUGGESTED_RULES_SCHEMA, type SuggestionRequest } from "./suggestions.js";

// The one place the tracker talks to Claude (ADR 0003). Kept thin and untested: suggestions.ts builds what is sent and
// reads what comes back. Its errors never quote descriptions, suggestions or the API key.

const MODEL = "claude-sonnet-5-5";

const INSTRUCTIONS = `You suggest Categorisation Rules for a personal finance tracker. The user message is JSON holding descriptions of Transactions from the user's Statements that no rule matches yet, each with whether money came in or went out, and the user's Categories, each a Spending or Earnings Category with its Subcategories.

A Categorisation Rule matches every description containing its "contains" text, ignoring case. For each rule you suggest:
- Choose "contains" text that appears in at least one of the descriptions, short enough to cover variants of the same merchant or payer, such as leaving out store numbers and references, but not so short it catches unrelated descriptions. Runs of digits were masked as ####, so never include #### in "contains" text.
- Either use one of the user's existing Categories and one of its Subcategories, spelt exactly as given, with "transfer" false, or set "transfer" true, with "category" and "subcategory" empty, for money moving between the user's own Accounts, such as paying a credit card bill or moving money to savings.
- Use a Spending Category for money going out and an Earnings Category for money coming in, unless money coming in is clearly a refund of earlier Spending.

Suggest a rule only when you are fairly sure of it. Leave out any description no existing Subcategory fits.`;

/** Asks Claude for Suggested Rules with exactly `request`, giving the text of its response. The API key comes only from `ANTHROPIC_API_KEY`. */
export async function askClaude(request: SuggestionRequest): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY isn't set, so Claude can't be asked. Set it in the shell that runs npm start, then start the tracker again.");
  const client = new Anthropic({ apiKey });
  let message: Anthropic.Beta.BetaMessage;
  try {
    message = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      system: INSTRUCTIONS,
      messages: [{ role: "user", content: JSON.stringify(request) }],
      output_config: { format: { type: "json_schema", schema: SUGGESTED_RULES_SCHEMA } },
    });
  } catch (error) {
    throw new Error(failureMessage(error));
  }
  if (message.stop_reason === "refusal") throw new Error("Claude declined to suggest rules for these descriptions. Untick some and try again.");
  if (message.stop_reason === "max_tokens") throw new Error("Claude's response was cut short, so nothing was suggested. Untick some descriptions and try again.");
  return message.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("");
}

/** Why asking Claude failed, from the kind of error alone, since an error's own message could quote the request. */
function failureMessage(error: unknown): string {
  if (error instanceof Anthropic.AuthenticationError) return "Claude refused the API key in ANTHROPIC_API_KEY. Check it in the Anthropic Console, then start the tracker again.";
  if (error instanceof Anthropic.PermissionDeniedError) return "The API key in ANTHROPIC_API_KEY isn't allowed to use Claude. Check it in the Anthropic Console.";
  if (error instanceof Anthropic.RateLimitError) return "Claude is receiving too many requests from this API key. Wait a minute, then try again.";
  if (error instanceof Anthropic.BadRequestError) return "Claude couldn't take the request, so nothing was suggested. Check the Anthropic Console has credit for this API key.";
  if (error instanceof Anthropic.APIConnectionError) return "Claude couldn't be reached, so nothing was suggested. Check your internet connection and try again.";
  if (error instanceof Anthropic.APIError) return "Claude had a problem answering, so nothing was suggested. Try again in a few minutes.";
  return "Asking Claude failed, so nothing was suggested. Try again.";
}
