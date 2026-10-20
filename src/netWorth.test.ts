import { describe, expect, it } from "vitest";
import { calculateNetWorth, type Balance, type MonthEndSnapshot } from "./netWorth.js";

const hsbc = (date: string, pence: number): Balance => ({
  account: "HSBC",
  kind: "Asset",
  date,
  pence,
  source: "Running",
});

/** A Month-End Snapshot with no Liabilities, so its Net Worth is its total Assets. */
const assetsOnly = (monthEnd: string, pence: number): MonthEndSnapshot => ({
  monthEnd,
  assets: pence,
  liabilities: 0,
  netWorth: pence,
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
      assetsOnly("2026-01-31", 80000),
      assetsOnly("2026-02-28", 90000),
      assetsOnly("2026-03-31", 60000),
      assetsOnly("2026-04-30", 60000),
    ]);
  });

  it("uses the last Balance listed when several share a date", () => {
    const balances = [hsbc("2026-01-30", 10000), hsbc("2026-01-30", 20000), hsbc("2026-01-30", 15000)];
    const { snapshots } = calculateNetWorth({ balances, trackingStart: january2026, today: "2026-01-31" });
    expect(snapshots).toEqual([assetsOnly("2026-01-31", 15000)]);
  });

  it("totals each Account's Balance to the penny", () => {
    const balances = [hsbc("2026-01-10", 10), { ...hsbc("2026-01-12", 20), account: "Savings" }];
    const { snapshots } = calculateNetWorth({ balances, trackingStart: january2026, today: "2026-01-31" });
    expect(snapshots).toEqual([assetsOnly("2026-01-31", 30)]);
  });

  it("gives each month inside a year-long Statement the Running Balance after its last Transaction on or before the month-end", () => {
    const kroo = (date: string, pence: number, source: Balance["source"] = "Running"): Balance => ({
      account: "Kroo",
      kind: "Asset",
      date,
      pence,
      source,
    });
    // One Statement covering 6 April 2025 to 5 April 2026, listed Closing Balance first as the reader returns it.
    const balances = [
      kroo("2026-04-05", 40000, "Closing"),
      kroo("2025-04-06", 10000),
      kroo("2025-12-20", 20000),
      kroo("2026-01-31", 25000),
      kroo("2026-01-31", 30000),
      kroo("2026-03-02", 40000),
    ];
    const { snapshots } = calculateNetWorth({ balances, trackingStart: january2026, today: "2026-04-10" });
    expect(snapshots).toEqual([
      assetsOnly("2026-01-31", 30000),
      assetsOnly("2026-02-28", 30000),
      assetsOnly("2026-03-31", 40000),
      assetsOnly("2026-04-30", 40000),
    ]);
  });

  it("counts an Account only from its first Balance onward, adding it to the other Accounts after that", () => {
    const kroo: Balance = { account: "Kroo", kind: "Asset", date: "2026-02-10", pence: 5000, source: "Running" };
    const balances = [hsbc("2026-01-05", 100000), kroo];
    const { snapshots } = calculateNetWorth({ balances, trackingStart: january2026, today: "2026-03-01" });
    expect(snapshots).toEqual([
      assetsOnly("2026-01-31", 100000),
      assetsOnly("2026-02-28", 105000),
      assetsOnly("2026-03-31", 105000),
    ]);
  });

  it("carries each Account's Closing Balance forward unchanged until its next Statement, including one dated before Tracking Start", () => {
    const vanguard = (account: string, date: string, pence: number): Balance => ({
      account,
      kind: "Asset",
      date,
      pence,
      source: "Closing",
    });
    // Quarterly Statements, each giving both Accounts one Closing Balance at the end of its period.
    const balances = [
      vanguard("Vanguard ISA", "2025-12-31", 100000),
      vanguard("Vanguard General Account", "2025-12-31", 50000),
      vanguard("Vanguard ISA", "2026-03-31", 120000),
      vanguard("Vanguard General Account", "2026-03-31", 45000),
    ];
    const { snapshots } = calculateNetWorth({ balances, trackingStart: january2026, today: "2026-05-02" });
    expect(snapshots).toEqual([
      assetsOnly("2026-01-31", 150000),
      assetsOnly("2026-02-28", 150000),
      assetsOnly("2026-03-31", 165000),
      assetsOnly("2026-04-30", 165000),
      assetsOnly("2026-05-31", 165000),
    ]);
  });

  it("gives each Month-End Snapshot its total Assets and total Liabilities, with Net Worth the Assets less the Liabilities", () => {
    const amex = (date: string, pence: number): Balance => ({
      account: "Amex",
      kind: "Liability",
      date,
      pence,
      source: "Closing",
    });
    const balances = [hsbc("2026-01-20", 300000), amex("2026-01-05", 47971), amex("2026-02-05", 158632)];
    const { snapshots } = calculateNetWorth({ balances, trackingStart: january2026, today: "2026-02-10" });
    expect(snapshots).toEqual([
      { monthEnd: "2026-01-31", assets: 300000, liabilities: 47971, netWorth: 252029 },
      { monthEnd: "2026-02-28", assets: 300000, liabilities: 158632, netWorth: 141368 },
    ]);
  });

  it("carries a Balance from before Tracking Start into the first Month-End Snapshots", () => {
    const balances = [hsbc("2025-12-29", 50000), hsbc("2026-02-14", 65000)];
    const { snapshots } = calculateNetWorth({ balances, trackingStart: january2026, today: "2026-02-20" });
    expect(snapshots).toEqual([
      assetsOnly("2026-01-31", 50000),
      assetsOnly("2026-02-28", 65000),
    ]);
  });
});
