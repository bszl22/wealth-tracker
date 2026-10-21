import { describe, expect, it } from "vitest";
import type { Balance } from "./netWorth.js";
import { buildReport, type ReportInput } from "./report.js";
import type { Category, CategorisationRule } from "./rules.js";
import type { Transaction } from "./spending.js";

// Made-up Balances and Transactions. Every description and figure is invented.
const balance = (date: string, pence: number): Balance => ({
  statement: "HSBC Statements/2026.pdf",
  account: "HSBC",
  kind: "Asset",
  date,
  pence,
  source: "Running",
});
const transaction = (date: string, direction: Transaction["direction"], pence: number, description: string): Transaction => ({
  statement: "HSBC Statements/2026.pdf",
  account: "HSBC",
  date,
  description,
  pence,
  direction,
});

const food: Category = { name: "Food", kind: "Spending", subcategories: ["Groceries"] };
const work: Category = { name: "Work", kind: "Earnings", subcategories: ["Salary"] };
const rules: CategorisationRule[] = [
  { contains: "CORNER SHOP", category: "Food", subcategory: "Groceries" },
  { contains: "EMPLOYER LTD", category: "Work", subcategory: "Salary" },
  { contains: "CARD BILL", transfer: true },
];

const report = (input: Pick<ReportInput, "balances" | "transactions" | "today">) =>
  buildReport({
    categories: [food, work],
    rules,
    rulesFile: { path: "rules.json", found: true },
    trackingStart: { year: 2026, month: 1 },
    ...input,
  });

describe("buildReport", () => {
  it("gives one month per month end from Tracking Start through today, each with its own Month-End Snapshot, Spending and Earnings", () => {
    const { months } = report({
      balances: [balance("2025-12-31", 100000), balance("2026-02-10", 150000), balance("2026-03-05", 140000)],
      transactions: [
        transaction("2026-01-05", "Out", 1000, "CORNER SHOP"),
        transaction("2026-02-05", "Out", 2000, "CORNER SHOP"),
        transaction("2026-02-20", "In", 50000, "CR EMPLOYER LTD"),
        transaction("2026-03-05", "Out", 3000, "CORNER SHOP"),
      ],
      today: "2026-03-15",
    });
    expect(
      months.map(({ snapshot, partial, spending, earnings, net }) => ({
        snapshot,
        partial,
        spending: spending.total,
        earnings: earnings.total,
        net,
      })),
    ).toEqual([
      { snapshot: { monthEnd: "2026-01-31", assets: 100000, liabilities: 0, netWorth: 100000 }, partial: false, spending: 1000, earnings: 0, net: -1000 },
      { snapshot: { monthEnd: "2026-02-28", assets: 150000, liabilities: 0, netWorth: 150000 }, partial: false, spending: 2000, earnings: 50000, net: 48000 },
      { snapshot: { monthEnd: "2026-03-31", assets: 140000, liabilities: 0, netWorth: 140000 }, partial: true, spending: 3000, earnings: 0, net: -3000 },
    ]);
  });

  it("breaks each month's change in Net Worth since the Month-End Snapshot before it into Earnings − Spending and Other Change, which add up exactly, from February", () => {
    const { months } = report({
      balances: [balance("2026-01-31", 1000000), balance("2026-02-28", 1150000), balance("2026-03-31", 1120000)],
      transactions: [
        transaction("2026-01-05", "Out", 99999, "CORNER SHOP"),
        transaction("2026-02-05", "Out", 40000, "CORNER SHOP"),
        transaction("2026-02-20", "In", 250000, "CR EMPLOYER LTD"),
        transaction("2026-02-21", "Out", 80000, "CARD BILL PAYMENT"),
        transaction("2026-03-05", "Out", 10000, "CORNER SHOP"),
      ],
      today: "2026-03-15",
    });
    expect(months.map((m) => m.netWorthChange)).toEqual([
      undefined,
      { since: "2026-01-31", change: 150000, net: 210000, otherChange: -60000 },
      { since: "2026-02-28", change: -30000, net: -10000, otherChange: -20000 },
    ]);
  });
});
