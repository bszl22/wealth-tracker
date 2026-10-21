import type { UncategorisedDescription } from "./spending.js";
import type { Direction, Pence } from "./statements.js";

// How a Categorisation Rule matches a description, shared by the Spending calculator and the page's rule form. It
// imports only types, so the server can send it to the page with the types stripped.

/** Whether a description contains a rule's "contains" text, ignoring case. Blank text matches nothing. */
export function ruleMatches(contains: string, description: string): boolean {
  return contains.trim() !== "" && description.toLowerCase().includes(contains.toLowerCase());
}

/** What a rule with this "contains" text would catch among the Uncategorised descriptions. */
export type RulePreview = { descriptionCount: number; spending: Pence; earnings: Pence };

/** How many Uncategorised descriptions a rule's "contains" text would catch, and their Spending and Earnings totals. */
export function previewRule(contains: string, uncategorised: UncategorisedDescription[]): RulePreview {
  const caught = uncategorised.filter(({ description }) => ruleMatches(contains, description));
  const total = (direction: Direction) => caught.filter((d) => d.direction === direction).reduce((sum, d) => sum + d.pence, 0);
  return { descriptionCount: caught.length, spending: total("Out"), earnings: total("In") };
}
