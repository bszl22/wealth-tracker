import { ruleMatches } from "./matching.js";
import type { CategorisationRule, Category } from "./rules.js";
import type { UncategorisedDescription } from "./spending.js";
import type { Direction } from "./statements.js";

// What asking Claude for Suggested Rules sends, the one place data leaves the Mac (ADR 0003), and what comes back.
// It imports only types and the matching the page already has, so the server can send it to the page, which shows
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

/** A Categorisation Rule Claude proposes. It changes nothing until approved, and is then saved like any other rule. */
export type SuggestedRule = CategorisationRule;

/**
 * The Suggested Rules in Claude's response, `text`, using the rules file's Categories and Subcategories or marking a
 * Transfer, each with "contains" text matching at least one real, unmasked Uncategorised description.
 */
export function suggestedRules(text: string, { uncategorised, categories }: { uncategorised: UncategorisedDescription[]; categories: Category[] }): SuggestedRule[] {
  const suggestions = suggestionsIn(text);
  const same = (a: unknown, b: string) => typeof a === "string" && a.toLowerCase() === b.toLowerCase();
  const catchesSomething = (contains: unknown) => typeof contains === "string" && uncategorised.some(({ description }) => ruleMatches(contains, description));
  return suggestions.flatMap(({ contains, transfer, category: categoryName, subcategory: subcategoryName }): SuggestedRule[] => {
    if (!catchesSomething(contains)) return [];
    if (transfer === true) return [{ contains: contains as string, transfer }];
    const category = categories.find((c) => same(categoryName, c.name));
    const subcategory = category?.subcategories.find((s) => same(subcategoryName, s));
    return category && subcategory ? [{ contains: contains as string, category: category.name, subcategory }] : [];
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
