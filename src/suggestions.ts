import { markedNew, ruleMatches, type Category, type RuleToSave } from "./rules.js";
import type { UncategorisedDescription } from "./spending.js";
import type { Direction } from "./statements.js";

// What asking Claude for Suggested Rules sends, the one place data leaves the Mac (ADR 0003), and what comes back.
// It imports only types and the rule module the page already has, so the server can send it to the page, which shows
// exactly the about-to-send list.

/** One description as it would be sent: masked, with whether money came in or went out, and nothing else. */
export type SentDescription = { description: string; direction: Direction };

/** Everything asking for Suggested Rules sends: the ticked descriptions, and the Categories to prefer. */
export type SuggestionRequest = { descriptions: SentDescription[]; categories: Category[] };

/** Runs this long or longer can be account, card or sort-code fragments and references. */
const MASKED_DIGITS = /\d{4,}/g;

/** What asking for Suggested Rules could send: each distinct masked Uncategorised description once, in the order given. */
export function aboutToSend(uncategorised: UncategorisedDescription[]): SentDescription[] {
  const descriptions = new Map<string, SentDescription>();
  for (const { description, direction } of uncategorised) {
    const sent = { description: description.replace(MASKED_DIGITS, "####"), direction };
    descriptions.set(key(sent), sent);
  }
  return [...descriptions.values()];
}

/**
 * The request for Suggested Rules: the rows of the about-to-send list that are `ticked`, in its order, and each
 * Category's name, kind and Subcategories. A ticked row not on the list is never sent.
 */
export function suggestionRequest({ uncategorised, categories, ticked }: { uncategorised: UncategorisedDescription[]; categories: Category[]; ticked: SentDescription[] }): SuggestionRequest {
  const chosen = new Set(ticked.filter(isSentDescription).map(key));
  return {
    descriptions: aboutToSend(uncategorised).filter((sent) => chosen.has(key(sent))),
    categories: categories.map(({ name, kind, subcategories }) => ({ name, kind, subcategories })),
  };
}

function isSentDescription(row: unknown): row is SentDescription {
  const { description, direction } = (typeof row === "object" && row !== null ? row : {}) as Record<string, unknown>;
  return typeof description === "string" && (direction === "In" || direction === "Out");
}

const key = ({ description, direction }: SentDescription) => [direction, description].join("\n");

/** Sends a request for Suggested Rules to Claude and gives the text of its response. */
export type AskClaude = (request: SuggestionRequest) => Promise<string>;

/**
 * Suggested Rules for the ticked rows of the about-to-send list, asking Claude once through `ask`. Asks nothing when
 * no row is ticked.
 */
export async function askForSuggestedRules(
  { uncategorised, categories }: { uncategorised: UncategorisedDescription[]; categories: Category[] },
  ticked: SentDescription[],
  ask: AskClaude,
): Promise<SuggestedRule[]> {
  const request = suggestionRequest({ uncategorised, categories, ticked });
  if (request.descriptions.length === 0) throw new Error("Tick at least one description to ask Claude for Suggested Rules.");
  return suggestedRules(await ask(request), { uncategorised, categories });
}

/** The instructions Claude is asked for Suggested Rules with, alongside each request. */
export const SUGGESTED_RULES_INSTRUCTIONS = `You suggest Categorisation Rules for a personal finance tracker. The user message is JSON holding descriptions of Transactions from the user's Statements that no rule matches yet, each with whether money came in or went out, and the user's Categories, each a Spending or Earnings Category with its Subcategories.

A Categorisation Rule matches every description containing its "contains" text, ignoring case. For each rule you suggest:
- Choose "contains" text that appears in at least one of the descriptions, short enough to cover variants of the same merchant or payer, such as leaving out store numbers and references, but not so short it catches unrelated descriptions. Runs of digits were masked as ####, so never include #### in "contains" text.
- Prefer the user's existing Categories and Subcategories: use one of them, spelt exactly as given, with "transfer" false, whenever one fits. Or set "transfer" true, with "category" and "subcategory" empty, for money moving between the user's own Accounts, such as paying a credit card bill or moving money to savings.
- Only when no existing Subcategory fits, name a new Subcategory of an existing Category, or, when no existing Category fits either, a new Category and one Subcategory of it. Keep new names short and general enough for other merchants or payers like it, and never name a new Category or Subcategory the same as an existing one. The user decides whether to add it.
- Use a Spending Category for money going out and an Earnings Category for money coming in, unless money coming in is clearly a refund of earlier Spending. A new Category takes the kind of the money its rule catches.
- Subscriptions is not a Category, so never suggest a Category named Subscriptions. Sort a subscription into a Category for what it is for, such as streaming or software.

Suggest a rule only when you are fairly sure of it.`;

/** The shape Claude's response is constrained to: each suggestion's "contains" text, and a Subcategory or Transfer. */
export const SUGGESTED_RULES_SCHEMA = {
  type: "object",
  properties: {
    suggestions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          contains: { type: "string" },
          transfer: { type: "boolean" },
          category: { type: "string" },
          subcategory: { type: "string" },
        },
        required: ["contains", "transfer", "category", "subcategory"],
        additionalProperties: false,
      },
    },
  },
  required: ["suggestions"],
  additionalProperties: false,
};

/**
 * A Categorisation Rule Claude proposes, and any new Category or Subcategory it adds. It changes nothing until
 * approved, and is then saved like any other rule.
 */
export type SuggestedRule = RuleToSave;

/**
 * The Suggested Rules in Claude's response, `text`, each with "contains" text matching at least one real, unmasked
 * Uncategorised description, and marking a Transfer or naming a Category and Subcategory. A Category or Subcategory
 * not in the rules file is marked as new, a new Category being Earnings when most of the descriptions the rule matches
 * are money in, and Spending otherwise.
 */
export function suggestedRules(text: string, { uncategorised, categories }: { uncategorised: UncategorisedDescription[]; categories: Category[] }): SuggestedRule[] {
  const suggestions = suggestionsIn(text);
  const trimmed = (text: unknown) => (typeof text === "string" ? text.trim() : "");
  return suggestions.flatMap(({ contains, transfer, category: named, subcategory: subcategoryNamed }): SuggestedRule[] => {
    if (typeof contains !== "string") return [];
    if (!uncategorised.some(({ description }) => ruleMatches(contains, description))) return [];
    if (transfer === true) return [{ contains, transfer }];
    const [category, subcategory] = [trimmed(named), trimmed(subcategoryNamed)];
    if (category === "" || subcategory === "") return [];
    return [markedNew({ contains, category, subcategory }, { uncategorised, categories })];
  });
}

/** Each suggestion in Claude's response, failing, quoting nothing from it, when it isn't a list of suggestions. */
function suggestionsIn(text: string): Record<string, unknown>[] {
  const unreadable = new Error("Claude's response couldn't be read as Suggested Rules, so nothing was suggested. Try again.");
  let response: unknown;
  try {
    response = JSON.parse(text);
  } catch {
    throw unreadable;
  }
  const { suggestions } = (typeof response === "object" && response !== null ? response : {}) as Record<string, unknown>;
  if (!Array.isArray(suggestions) || !suggestions.every((s) => typeof s === "object" && s !== null)) throw unreadable;
  return suggestions as Record<string, unknown>[];
}
