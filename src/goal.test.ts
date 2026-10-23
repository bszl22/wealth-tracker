import { describe, expect, it } from "vitest";
import type { Goal } from "./goal.js";
import { buildReport, type ReportInput } from "./report.js";
import type { Category, CategorisationRule } from "./rules.js";
import { reconcileStatements } from "./scanStatements.js";
import type { StatementBalance, StatementTransaction } from "./statements.js";

// Made-up Balances and Transactions. Every description and figure is invented.
const balance = (date: string, pence: number): StatementBalance => ({ date, pence, source: "Running" });
const out = (date: string, pence: number, description: string): StatementTransaction => ({ date, description, pence, direction: "Out" });

const categories: Category[] = [
  { name: "Home", kind: "Spending", subcategories: ["Rent"] },
  { name: "Food", kind: "Spending", subcategories: ["Groceries"] },
  { name: "Fun", kind: "Spending", subcategories: ["Streaming", "Holidays"] },
];
const rules: CategorisationRule[] = [
  { contains: "CORNER SHOP", category: "Food", subcategory: "Groceries" },
  { contains: "STREAMFLIX", category: "Fun", subcategory: "Streaming", subscription: "Monthly" },
  { contains: "SKY AIRLINES", category: "Fun", subcategory: "Holidays" },
];

// Net Worth is £10,000 at January's end and rises £500 a month to £11,500 at April's end.
const balances = [balance("2026-01-31", 1000000), balance("2026-02-28", 1050000), balance("2026-03-31", 1100000), balance("2026-04-30", 1150000)];
const transactions = [
  out("2026-01-06", 90000, "CORNER SHOP"),
  ...["02", "03", "04"].flatMap((month) => [out(`2026-${month}-06`, 6000, "CORNER SHOP"), out(`2026-${month}-10`, 1000, "STREAMFLIX")]),
  out("2026-03-20", 30000, "SKY AIRLINES"),
];

/** The Goal's progress in the Report from one HSBC Statement, with Tracking Start in January 2026. */
const progress = (goal: Goal | undefined, today: ReportInput["today"], statementBalances = balances) =>
  buildReport({
    statements: reconcileStatements([{ file: "HSBC Statements/2026.pdf", accounts: [{ name: "HSBC", kind: "Asset", balances: statementBalances, transactions }] }]),
    categories,
    rules,
    rulesFile: { path: "rules.json", found: true },
    trackingStart: { year: 2026, month: 1 },
    today,
    apiKeySet: false,
    goal,
  }).goal;

const twentyThousandByDecember: Goal = { netWorth: 2000000, by: { year: 2026, month: 12 } };

describe("a Goal's progress", () => {
  it("has none without a Goal", () => {
    expect(progress(undefined, "2026-05-15")).toBeUndefined();
  });

  it("starts from the latest complete Month-End Snapshot and needs the rest spread over the month-ends to the Goal's", () => {
    const goal = progress(twentyThousandByDecember, "2026-05-15");
    expect(goal).toMatchObject({ state: "Ahead", from: { monthEnd: "2026-04-30", netWorth: 1150000 }, monthsLeft: 8, needed: 106250 });
  });

  it("takes the Pace from the last 3 complete months' change in Net Worth, Other Change included, and projects it to the Goal's month", () => {
    const goal = progress(twentyThousandByDecember, "2026-05-15");
    expect(goal).toMatchObject({ pace: { pence: 50000, months: ["2026-02-28", "2026-03-31", "2026-04-30"] }, projected: 1550000 });
  });

  it("when short, lists the top Spending Categories and current Subscriptions over the Pace's months, with each one's share of the shortfall", () => {
    const goal = progress(twentyThousandByDecember, "2026-05-15");
    if (goal?.state !== "Ahead") throw new Error("expected the Goal to be ahead");
    const { shortfall } = goal;
    expect(shortfall?.pence).toBe(56250);
    // January's large grocery shop is outside the Pace's months, and Home, with nothing spent, is left out.
    expect(shortfall?.spending.map(({ name, monthly }) => ({ name, monthly }))).toEqual([
      { name: "Fun", monthly: 11000 },
      { name: "Food", monthly: 6000 },
    ]);
    expect(shortfall?.spending[0]!.share).toBeCloseTo(11000 / 56250);
    expect(shortfall?.subscriptions.map(({ name, monthly }) => ({ name, monthly }))).toEqual([{ name: "Streaming (STREAMFLIX)", monthly: 1000 }]);
  });

  it("has no shortfall when the Pace is enough", () => {
    const goal = progress({ netWorth: 1300000, by: { year: 2026, month: 12 } }, "2026-05-15");
    expect(goal).toMatchObject({ state: "Ahead", needed: 18750, shortfall: undefined });
  });

  it("uses the complete months there are when fewer than 3 have a change in Net Worth", () => {
    const goal = progress(twentyThousandByDecember, "2026-03-15");
    expect(goal).toMatchObject({ state: "Ahead", pace: { pence: 50000, months: ["2026-02-28"] } });
  });

  it("has no Pace, projection or shortfall when only Tracking Start's month is complete", () => {
    const goal = progress(twentyThousandByDecember, "2026-02-10");
    expect(goal).toMatchObject({ state: "Ahead", from: { monthEnd: "2026-01-31" }, pace: undefined, projected: undefined, shortfall: undefined });
  });

  it("waits while no month is complete", () => {
    expect(progress(twentyThousandByDecember, "2026-01-20")).toMatchObject({ state: "Waiting" });
  });

  it("is reached when the starting Net Worth is at or above the Goal", () => {
    expect(progress({ netWorth: 1150000, by: { year: 2026, month: 12 } }, "2026-05-15")).toMatchObject({ state: "Reached" });
  });

  it("has passed once the Goal's month is complete, giving that month's Month-End Snapshot", () => {
    const goal = progress({ netWorth: 2000000, by: { year: 2026, month: 3 } }, "2026-05-15");
    expect(goal).toMatchObject({ state: "Passed", final: { monthEnd: "2026-03-31", netWorth: 1100000 } });
  });

  it("names the Stale Accounts", () => {
    expect(progress(twentyThousandByDecember, "2026-07-15")).toMatchObject({ stale: ["HSBC"] });
    expect(progress(twentyThousandByDecember, "2026-05-15")).toMatchObject({ stale: [] });
  });
});
