import { describe, expect, it } from "vitest";
import type { Category } from "./rules.js";
import type { UncategorisedDescription } from "./spending.js";
import type { Direction } from "./statements.js";
import { aboutToSend, askForSuggestedRules, suggestedRules, suggestionRequest, type SuggestionRequest } from "./suggestions.js";

// Made-up Uncategorised descriptions and Categories. Every description and figure is invented.
const uncategorised = (description: string, direction: Direction, pence = 1000): UncategorisedDescription => ({
  description,
  direction,
  pence,
  transactions: [
    { statement: "HSBC Statements/2026.pdf", account: "HSBC Current 40-11-22 31926819", date: "2026-03-04", description, pence, direction },
  ],
});

const categories: Category[] = [
  { name: "Food", kind: "Spending", subcategories: ["Groceries", "Eating Out"] },
  { name: "Work", kind: "Earnings", subcategories: ["Salary"] },
];

describe("aboutToSend", () => {
  it("masks every run of 4 or more digits as ####, keeping runs of 1 to 3, even next to letters", () => {
    const sent = aboutToSend([
      uncategorised("CORNER SHOP 0412", "Out"),
      uncategorised("CARD 4921 REF 77310042", "Out"),
      uncategorised("REF1234X", "Out"),
      uncategorised("7 DAYS 24 HR 365", "Out"),
    ]);
    expect(sent.map((d) => d.description)).toEqual(["CORNER SHOP ####", "CARD #### REF ####", "REF####X", "7 DAYS 24 HR 365"]);
  });

  it("holds each distinct masked description once with its direction, and no amounts, dates, Balances or Accounts", () => {
    const sent = aboutToSend([
      uncategorised("SUPERMARKET 0412", "Out", 5200),
      uncategorised("SUPERMARKET 0577", "Out", 4100),
      uncategorised("PAYMENT FROM A FRIEND", "In", 4500),
      uncategorised("PAYMENT FROM A FRIEND", "Out", 2000),
    ]);
    expect(sent).toEqual([
      { description: "SUPERMARKET ####", direction: "Out" },
      { description: "PAYMENT FROM A FRIEND", direction: "In" },
      { description: "PAYMENT FROM A FRIEND", direction: "Out" },
    ]);
  });
});

describe("suggestionRequest", () => {
  const all = [uncategorised("SUPERMARKET 0412", "Out"), uncategorised("PAYMENT FROM A FRIEND", "In"), uncategorised("PAYMENT FROM A FRIEND", "Out")];

  it("holds only the ticked rows, by masked description and direction, and the Categories with their kind and Subcategories", () => {
    const request = suggestionRequest({
      uncategorised: all,
      categories,
      ticked: [{ description: "PAYMENT FROM A FRIEND", direction: "Out" }, { description: "SUPERMARKET ####", direction: "Out" }],
    });
    expect(request).toEqual({
      descriptions: [
        { description: "SUPERMARKET ####", direction: "Out" },
        { description: "PAYMENT FROM A FRIEND", direction: "Out" },
      ],
      categories: [
        { name: "Food", kind: "Spending", subcategories: ["Groceries", "Eating Out"] },
        { name: "Work", kind: "Earnings", subcategories: ["Salary"] },
      ],
    });
  });

  it("never sends a ticked row that isn't on the about-to-send list, such as unmasked text or something else entirely", () => {
    const { descriptions } = suggestionRequest({
      uncategorised: all,
      categories,
      ticked: [
        { description: "SUPERMARKET 0412", direction: "Out" },
        { description: "PAYMENT FROM A FRIEND", direction: "Spending" as Direction },
        { description: "ANYTHING ELSE", direction: "In" },
        null as never,
        "SUPERMARKET ####" as never,
      ],
    });
    expect(descriptions).toEqual([]);
  });
});

describe("suggestedRules", () => {
  const real = [
    uncategorised("CORNER SHOP 0412", "Out", 5200),
    uncategorised("CORNER SHOP 0577", "Out", 4100),
    uncategorised("PAYMENT FROM A FRIEND", "In", 4500),
    uncategorised("CITY PARKING 20417", "Out", 450),
  ];
  /** A made-up response from Claude, as the text it returns. */
  const response = (...suggestions: object[]) => JSON.stringify({ suggestions });

  it("reads a suggestion using an existing Category and Subcategory, naming them as the rules file does", () => {
    const suggested = suggestedRules(response({ contains: "CORNER SHOP", transfer: false, category: "food", subcategory: "GROCERIES" }), { uncategorised: real, categories });
    expect(suggested).toEqual([{ contains: "CORNER SHOP", category: "Food", subcategory: "Groceries" }]);
  });

  it("reads a suggestion marking a Transfer", () => {
    const suggested = suggestedRules(response({ contains: "FRIEND", transfer: true, category: "", subcategory: "" }), { uncategorised: real, categories });
    expect(suggested).toEqual([{ contains: "FRIEND", transfer: true }]);
  });

  it("marks a suggestion naming a Subcategory not in the rules file as adding it to its existing Category", () => {
    const suggested = suggestedRules(response({ contains: "CORNER SHOP", transfer: false, category: "food", subcategory: " Snacks " }), { uncategorised: real, categories });
    expect(suggested).toEqual([{ contains: "CORNER SHOP", category: "Food", subcategory: "Snacks", adds: { new: "Subcategory" } }]);
  });

  it("marks a suggestion naming a Category not in the rules file as adding it, Spending when the descriptions it matches are money out", () => {
    const suggested = suggestedRules(response({ contains: "CITY PARKING", transfer: false, category: "Transport", subcategory: "Parking" }), { uncategorised: real, categories });
    expect(suggested).toEqual([{ contains: "CITY PARKING", category: "Transport", subcategory: "Parking", adds: { new: "Category", kind: "Spending" } }]);
  });

  it("makes a new Category Earnings when most of the descriptions it matches are money in", () => {
    const mixed = [...real, uncategorised("GIFT FROM GRAN", "In"), uncategorised("GIFT FROM GRAN", "Out"), uncategorised("BIRTHDAY GIFT", "In")];
    const suggested = suggestedRules(response({ contains: "GIFT", transfer: false, category: "Gifts", subcategory: "Family" }), { uncategorised: mixed, categories });
    expect(suggested).toEqual([{ contains: "GIFT", category: "Gifts", subcategory: "Family", adds: { new: "Category", kind: "Earnings" } }]);
  });

  it("makes a new Category Spending when the descriptions it matches are as often money out as money in", () => {
    const even = [...real, uncategorised("GIFT FROM GRAN", "In"), uncategorised("GIFT FROM GRAN", "Out")];
    const suggested = suggestedRules(response({ contains: "GIFT", transfer: false, category: "Gifts", subcategory: "Family" }), { uncategorised: even, categories });
    expect(suggested).toEqual([{ contains: "GIFT", category: "Gifts", subcategory: "Family", adds: { new: "Category", kind: "Spending" } }]);
  });

  it("doesn't offer a suggestion with no Category or Subcategory name that isn't a Transfer", () => {
    const suggested = suggestedRules(
      response(
        { contains: "CITY PARKING", transfer: false, category: "", subcategory: "Parking" },
        { contains: "CITY PARKING", transfer: false, category: "Transport", subcategory: "  " },
        { contains: "CORNER SHOP", transfer: false, category: "Food", subcategory: 7 },
      ),
      { uncategorised: real, categories },
    );
    expect(suggested).toEqual([]);
  });

  it("drops a suggestion whose \"contains\" text matches no real, unmasked Uncategorised description, such as masked text", () => {
    const suggested = suggestedRules(
      response(
        { contains: "CITY PARKING ####", transfer: false, category: "Food", subcategory: "Eating Out" },
        { contains: "SHOP ####", transfer: true, category: "", subcategory: "" },
        { contains: "NOWHERE MENTIONED", transfer: true, category: "", subcategory: "" },
        { contains: "  ", transfer: true, category: "", subcategory: "" },
        { contains: "city parking", transfer: false, category: "Food", subcategory: "Eating Out" },
      ),
      { uncategorised: real, categories },
    );
    expect(suggested).toEqual([{ contains: "city parking", category: "Food", subcategory: "Eating Out" }]);
  });

  it("fails with a clear message, quoting nothing from it, when the response can't be read as Suggested Rules", () => {
    for (const text of ["Here are some rules: CORNER SHOP", "", "null", '{"rules": []}', '{"suggestions": "CORNER SHOP"}', '{"suggestions": ["CORNER SHOP"]}']) {
      expect(() => suggestedRules(text, { uncategorised: real, categories })).toThrow(
        new Error("Claude's response couldn't be read as Suggested Rules, so nothing was suggested. Try again."),
      );
    }
  });
});

describe("askForSuggestedRules", () => {
  const real = [uncategorised("CORNER SHOP 0412", "Out"), uncategorised("PAYMENT FROM A FRIEND", "In")];

  it("asks once with the request for the ticked rows, and gives the Suggested Rules in the response", async () => {
    const asked: SuggestionRequest[] = [];
    const suggested = await askForSuggestedRules({ uncategorised: real, categories }, [{ description: "CORNER SHOP ####", direction: "Out" }], async (request) => {
      asked.push(request);
      return JSON.stringify({ suggestions: [{ contains: "CORNER SHOP", transfer: false, category: "Food", subcategory: "Groceries" }] });
    });
    expect(asked).toEqual([{ descriptions: [{ description: "CORNER SHOP ####", direction: "Out" }], categories }]);
    expect(suggested).toEqual([{ contains: "CORNER SHOP", category: "Food", subcategory: "Groceries" }]);
  });

  it("asks nothing when no row is ticked, saying so", async () => {
    let asked = 0;
    const asking = askForSuggestedRules({ uncategorised: real, categories }, [], async () => {
      asked += 1;
      return "";
    });
    await expect(asking).rejects.toThrow("Tick at least one description to ask Claude for Suggested Rules.");
    expect(asked).toBe(0);
  });
});
