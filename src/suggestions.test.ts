import { describe, expect, it } from "vitest";
import type { UncategorisedDescription } from "./spending.js";
import type { Direction } from "./statements.js";
import { suggestionRequest } from "./suggestions.js";

// Made-up Uncategorised descriptions. Every description and figure is invented.
const uncategorised = (description: string, direction: Direction, pence = 1000): UncategorisedDescription => ({
  description,
  direction,
  pence,
  transactions: [
    { statement: "HSBC Statements/2026.pdf", account: "HSBC Current 40-11-22 31926819", date: "2026-03-04", description, pence, direction },
  ],
});

describe("suggestionRequest", () => {
  it("masks every run of 4 or more digits as ####, keeping runs of 1 to 3, even next to letters", () => {
    const { descriptions } = suggestionRequest({
      uncategorised: [
        uncategorised("CORNER SHOP 0412", "Out"),
        uncategorised("CARD 4921 REF 77310042", "Out"),
        uncategorised("REF1234X", "Out"),
        uncategorised("7 DAYS 24 HR 365", "Out"),
      ],
      unticked: [],
    });
    expect(descriptions.map((d) => d.description)).toEqual(["CORNER SHOP ####", "CARD #### REF ####", "REF####X", "7 DAYS 24 HR 365"]);
  });

  it("holds each distinct masked description once with its direction, and no amounts, dates, Balances or Accounts", () => {
    const request = suggestionRequest({
      uncategorised: [
        uncategorised("SUPERMARKET 0412", "Out", 5200),
        uncategorised("SUPERMARKET 0577", "Out", 4100),
        uncategorised("PAYMENT FROM A FRIEND", "In", 4500),
        uncategorised("PAYMENT FROM A FRIEND", "Out", 2000),
      ],
      unticked: [],
    });
    expect(request).toEqual({
      descriptions: [
        { description: "SUPERMARKET ####", direction: "Out" },
        { description: "PAYMENT FROM A FRIEND", direction: "In" },
        { description: "PAYMENT FROM A FRIEND", direction: "Out" },
      ],
    });
  });

  it("leaves out an unticked row, by its masked description and direction", () => {
    const { descriptions } = suggestionRequest({
      uncategorised: [
        uncategorised("SUPERMARKET 0412", "Out"),
        uncategorised("PAYMENT FROM A FRIEND", "In"),
        uncategorised("PAYMENT FROM A FRIEND", "Out"),
      ],
      unticked: [{ description: "PAYMENT FROM A FRIEND", direction: "In" }, { description: "SUPERMARKET ####", direction: "Out" }],
    });
    expect(descriptions).toEqual([{ description: "PAYMENT FROM A FRIEND", direction: "Out" }]);
  });
});
