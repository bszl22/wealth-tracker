import { describe, expect, it } from "vitest";
import { readRules } from "./rules.js";
import { rulesFileHolding, type RulesFile } from "./rulesFile.js";
import type { StatementRead } from "./scanStatements.js";
import type { AskClaude } from "./suggestions.js";
import { createTracker } from "./tracker.js";

// One made-up Statement and rules file. Every Account, description and figure is invented.
const reads: StatementRead[] = [
  {
    file: "Made-up Bank/2026-02.pdf",
    accounts: [
      {
        name: "Current",
        kind: "Asset",
        balances: [{ date: "2026-02-28", pence: 100000, source: "Closing" }],
        transactions: [
          { date: "2026-02-03", description: "CORNER SHOP", pence: 1200, direction: "Out" },
          { date: "2026-02-10", description: "SKY AIRLINES", pence: 50000, direction: "Out" },
        ],
      },
    ],
  },
];

const food = { name: "Food", kind: "Spending", subcategories: ["Groceries"] };
const rulesContents = JSON.stringify({ categories: [food], rules: [] });

const trackerWith = (rulesFile: RulesFile = rulesFileHolding(rulesContents), claude?: AskClaude) =>
  createTracker({ readStatements: async () => reads, rulesFile, claude, trackingStart: { year: 2026, month: 2 }, today: () => "2026-03-05" });

describe("createTracker", () => {
  it("gives the Report from the Statements and rules file, reflecting a rule once it is saved", async () => {
    const tracker = trackerWith();
    expect((await tracker.report()).uncategorised.map(({ description }) => description)).toEqual(["SKY AIRLINES", "CORNER SHOP"]);
    await tracker.saveRule({ contains: "corner", category: "Food", subcategory: "Groceries" });
    const report = await tracker.report();
    expect(report.uncategorised.map(({ description }) => description)).toEqual(["SKY AIRLINES"]);
    expect(report.months.map(({ monthEnd, spending }) => [monthEnd, spending.categories[0]!.pence])).toEqual([
      ["2026-02-28", 1200],
      ["2026-03-31", 0],
    ]);
    expect(report.rulesFile).toEqual({ path: "rules.json", found: true });
  });

  it("saves rules made together each onto the file the one before wrote, in order", async () => {
    const rulesFile = rulesFileHolding(rulesContents);
    const tracker = trackerWith(rulesFile);
    await Promise.all([
      tracker.saveRule({ contains: "CORNER", category: "Food", subcategory: "Groceries" }),
      tracker.saveRule({ contains: "SKY", category: "Travel", subcategory: "Flights", adds: { new: "Category", kind: "Spending" } }),
      tracker.saveRule({ contains: "CARD BILL", transfer: true }),
    ]);
    expect(readRules(await rulesFile.read()).rules.map(({ contains }) => contains)).toEqual(["CORNER", "SKY", "CARD BILL"]);
  });

  it("fails a save the rules file can't write, and still saves the next", async () => {
    const memory = rulesFileHolding(rulesContents);
    let writes = 0;
    const failsFirst: RulesFile = {
      ...memory,
      write: async (contents) => {
        writes += 1;
        if (writes === 1) throw new Error("rules.json in the data folder can't be written, so the rule wasn't saved");
        await memory.write(contents);
      },
    };
    const tracker = trackerWith(failsFirst);
    const first = tracker.saveRule({ contains: "CORNER", category: "Food", subcategory: "Groceries" });
    const second = tracker.saveRule({ contains: "CARD BILL", transfer: true });
    await expect(first).rejects.toThrow("can't be written");
    await second;
    expect(readRules(await memory.read()).rules).toEqual([{ contains: "CARD BILL", transfer: true }]);
  });

  it("says no API key is set, and asks for no Suggested Rules, when there is no Claude to ask", async () => {
    const tracker = trackerWith();
    expect((await tracker.report()).apiKeySet).toBe(false);
    await expect(tracker.suggestRules([{ description: "SKY AIRLINES", direction: "Out" }])).rejects.toThrow(
      "ANTHROPIC_API_KEY isn't set, so Claude can't be asked. Set it in the shell that runs npm start, then start the tracker again.",
    );
  });

  it("asks Claude for Suggested Rules against the rules file as it is now", async () => {
    const tracker = trackerWith(rulesFileHolding(rulesContents), async () =>
      JSON.stringify({ suggestions: [{ contains: "SKY", transfer: false, category: "Travel", subcategory: "Flights" }] }),
    );
    expect((await tracker.report()).apiKeySet).toBe(true);
    expect(await tracker.suggestRules([{ description: "SKY AIRLINES", direction: "Out" }])).toEqual([
      { contains: "SKY", category: "Travel", subcategory: "Flights", adds: { new: "Category", kind: "Spending" } },
    ]);
    await tracker.saveRule({ contains: "CORNER", category: "Travel", subcategory: "Trains", adds: { new: "Category", kind: "Spending" } });
    expect(await tracker.suggestRules([{ description: "SKY AIRLINES", direction: "Out" }])).toEqual([
      { contains: "SKY", category: "Travel", subcategory: "Flights", adds: { new: "Subcategory" } },
    ]);
  });
});
