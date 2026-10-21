import { describe, expect, it } from "vitest";
import { previewRule } from "./matching.js";
import type { UncategorisedDescription } from "./spending.js";
import type { Direction } from "./statements.js";

// Made-up Uncategorised descriptions. Every description and figure is invented.
const uncategorised = (description: string, direction: Direction, pence: number): UncategorisedDescription => ({
  description,
  direction,
  pence,
  transactions: [],
});

const descriptions = [
  uncategorised("CORNER SHOP 0412", "Out", 4500),
  uncategorised("Corner Shop 0577", "Out", 1250),
  uncategorised("CORNER SHOP REFUND", "In", 300),
  uncategorised("SKY AIRLINES", "Out", 148000),
];

describe("previewRule", () => {
  it("counts the Uncategorised descriptions a rule's \"contains\" text catches, ignoring case, with their Spending and Earnings totals", () => {
    expect(previewRule("corner shop", descriptions)).toEqual({ descriptionCount: 3, spending: 5750, earnings: 300 });
  });

  it("catches nothing with blank \"contains\" text, which the rules file reader refuses", () => {
    expect(previewRule("  ", descriptions)).toEqual({ descriptionCount: 0, spending: 0, earnings: 0 });
  });
});
