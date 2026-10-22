import Anthropic from "@anthropic-ai/sdk";
import { SUGGESTED_RULES_INSTRUCTIONS, SUGGESTED_RULES_SCHEMA, type AskClaude } from "./suggestions.js";

// The one place the tracker talks to Claude (ADR 0003). Kept thin and untested: suggestions.ts builds what is sent,
// with the instructions, and reads what comes back. Its errors never quote descriptions, suggestions or the API key.

const MODEL = "claude-sonnet-5-5";

/** Asks Claude, with `apiKey`, for Suggested Rules with exactly the request, giving the text of its response. */
export function claudeWith(apiKey: string): AskClaude {
  return async (request) => {
    const client = new Anthropic({ apiKey });
    let message: Anthropic.Beta.BetaMessage;
    try {
      message = await client.beta.messages.create({
        model: MODEL,
        max_tokens: 16000,
        system: SUGGESTED_RULES_INSTRUCTIONS,
        messages: [{ role: "user", content: JSON.stringify(request) }],
        output_config: { format: { type: "json_schema", schema: SUGGESTED_RULES_SCHEMA } },
      });
    } catch (error) {
      throw new Error(failureMessage(error));
    }
    if (message.stop_reason === "refusal") throw new Error("Claude declined to suggest rules for these descriptions. Untick some and try again.");
    if (message.stop_reason === "max_tokens") throw new Error("Claude's response was cut short, so nothing was suggested. Untick some descriptions and try again.");
    return message.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("");
  };
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
