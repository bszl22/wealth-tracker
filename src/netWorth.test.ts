import { describe, expect, it } from "vitest";
import { calculateNetWorth, type Balance } from "./netWorth.js";

const hsbc = (date: string, pence: number): Balance => ({
  account: "HSBC",
  kind: "Asset",
  date,
  pence,
  source: "Running",
});

const january2026 = { year: 2026, month: 1 };

describe("calculateNetWorth", () => {
  it("gives one Month-End Snapshot per month from Tracking Start through the current month, each using the latest Balance on or before the month's last day", () => {
    const balances = [
      hsbc("2025-12-29", 50000),
      hsbc("2026-01-15", 70000),
      hsbc("2026-01-31", 80000),
      hsbc("2026-02-01", 90000),
      hsbc("2026-03-10", 60000),
    ];
    const { snapshots } = calculateNetWorth({ balances, trackingStart: january2026, today: "2026-04-03" });
    expect(snapshots).toEqual([
      { monthEnd: "2026-01-31", netWorth: 80000 },
      { monthEnd: "2026-02-28", netWorth: 90000 },
      { monthEnd: "2026-03-31", netWorth: 60000 },
      { monthEnd: "2026-04-30", netWorth: 60000 },
    ]);
  });

  it("uses the last Balance listed when several share a date", () => {
    const balances = [hsbc("2026-01-30", 10000), hsbc("2026-01-30", 20000), hsbc("2026-01-30", 15000)];
    const { snapshots } = calculateNetWorth({ balances, trackingStart: january2026, today: "2026-01-31" });
    expect(snapshots).toEqual([{ monthEnd: "2026-01-31", netWorth: 15000 }]);
  });

  it("totals each Account's Balance to the penny", () => {
    const balances = [hsbc("2026-01-10", 10), { ...hsbc("2026-01-12", 20), account: "Savings" }];
    const { snapshots } = calculateNetWorth({ balances, trackingStart: january2026, today: "2026-01-31" });
    expect(snapshots).toEqual([{ monthEnd: "2026-01-31", netWorth: 30 }]);
  });

  it("carries a Balance from before Tracking Start into the first Month-End Snapshots", () => {
    const balances = [hsbc("2025-12-29", 50000), hsbc("2026-02-14", 65000)];
    const { snapshots } = calculateNetWorth({ balances, trackingStart: january2026, today: "2026-02-20" });
    expect(snapshots).toEqual([
      { monthEnd: "2026-01-31", netWorth: 50000 },
      { monthEnd: "2026-02-28", netWorth: 65000 },
    ]);
  });
});
