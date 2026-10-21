import type { UncategorisedDescription } from "./spending.js";
import type { Direction } from "./statements.js";

// What asking Claude for Suggested Rules would send, the one place data leaves the Mac (ADR 0003). It imports only
// types, so the server can send it to the page, which shows exactly this list before anything is sent.

/** One description as it would be sent: masked, with whether money came in or went out, and nothing else. */
export type SentDescription = { description: string; direction: Direction };

export type SuggestionRequest = { descriptions: SentDescription[] };

/** Runs this long or longer can be account, card or sort-code fragments and references. */
const MASKED_DIGITS = /\d{4,}/g;

/**
 * The request for Suggested Rules covering the Uncategorised descriptions: each distinct masked description once, in
 * the order given, leaving out any unticked.
 */
export function suggestionRequest({ uncategorised, unticked }: { uncategorised: UncategorisedDescription[]; unticked: SentDescription[] }): SuggestionRequest {
  const leftOut = new Set(unticked.map(key));
  const descriptions = new Map<string, SentDescription>();
  for (const { description, direction } of uncategorised) {
    const sent = { description: description.replace(MASKED_DIGITS, "####"), direction };
    if (!leftOut.has(key(sent))) descriptions.set(key(sent), sent);
  }
  return { descriptions: [...descriptions.values()] };
}

const key = ({ description, direction }: SentDescription) => [direction, description].join("\n");
