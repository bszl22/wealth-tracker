import type { AccountKind, IsoDate, Pence, StatementBalance } from "./statements.js";

/** A Balance from any Statement, tagged with the Account it belongs to and the Statement file it came from. */
export type Balance = StatementBalance & { statement: string; account: string; kind: AccountKind };

export type YearMonth = { year: number; month: number };

/** A Liability holds the Balance owed as a positive number, so Net Worth is the Assets less the Liabilities. */
export type MonthEndSnapshot = { monthEnd: IsoDate; assets: Pence; liabilities: Pence; netWorth: Pence };

/** An Account's latest Balance on or before today, Stale when that Balance is more than 2 months old. */
export type AccountBalance = Omit<Balance, "source" | "statement"> & { stale: boolean };

export type NetWorthInput = {
  /** Every Balance from every Statement, each Statement's Balances in the order it lists them. */
  balances: Balance[];
  trackingStart: YearMonth;
  today: IsoDate;
};

export function calculateNetWorth({ balances, trackingStart, today }: NetWorthInput): {
  snapshots: MonthEndSnapshot[];
  accounts: AccountBalance[];
} {
  checkStatementsAgree(balances);
  const snapshots = monthEndsFrom(trackingStart, today).map((monthEnd): MonthEndSnapshot => {
    const latest = [...latestBalancesOnOrBefore(balances, monthEnd).values()];
    const assets = sum(latest.filter((b) => b.kind === "Asset"));
    const liabilities = sum(latest.filter((b) => b.kind === "Liability"));
    return { monthEnd, assets, liabilities, netWorth: assets - liabilities };
  });
  const staleBefore = twoMonthsBefore(today);
  const accounts = [...latestBalancesOnOrBefore(balances, today).values()]
    .map(({ account, kind, date, pence }): AccountBalance => ({ account, kind, date, pence, stale: date < staleBefore }))
    .sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.account.localeCompare(b.account));
  return { snapshots, accounts };
}

const KIND_ORDER: AccountKind[] = ["Asset", "Liability"];

/**
 * Fails when two Statements give different Balances for the same Account and date. Within one
 * Statement, several Running Balances can share a date, so each Statement's last listed one counts.
 */
function checkStatementsAgree(balances: Balance[]): void {
  const perStatement = new Map<string, Balance>();
  for (const balance of balances) perStatement.set(`${balance.statement}\n${balance.account}\n${balance.date}`, balance);
  const firstListed = new Map<string, Balance>();
  for (const balance of perStatement.values()) {
    const key = `${balance.account}\n${balance.date}`;
    const earlier = firstListed.get(key);
    if (!earlier) firstListed.set(key, balance);
    else if (earlier.pence !== balance.pence) {
      throw new Error(
        `${earlier.statement} and ${balance.statement} give different Balances for ${balance.account} on ${balance.date}`,
      );
    }
  }
}

/** Each Account's latest Balance dated on or before the given day; on a shared date, the last listed wins. */
function latestBalancesOnOrBefore(balances: Balance[], day: IsoDate): Map<string, Balance> {
  const latest = new Map<string, Balance>();
  for (const balance of balances) {
    if (balance.date > day) continue;
    const current = latest.get(balance.account);
    if (!current || balance.date >= current.date) latest.set(balance.account, balance);
  }
  return latest;
}

function sum(balances: Balance[]): Pence {
  return balances.reduce((total, b) => total + b.pence, 0);
}

/** The last day of each month from Tracking Start through the month holding today. */
export function monthEndsFrom(start: YearMonth, today: IsoDate): IsoDate[] {
  const [thisYear, thisMonth] = today.split("-").map(Number) as [number, number];
  const monthEnds: IsoDate[] = [];
  let { year, month } = start;
  while (year < thisYear || (year === thisYear && month <= thisMonth)) {
    monthEnds.push(lastDayOf(year, month));
    if (month === 12) {
      year += 1;
      month = 1;
    } else {
      month += 1;
    }
  }
  return monthEnds;
}

/** The same day 2 months earlier, or that month's last day when it is shorter. */
function twoMonthsBefore(today: IsoDate): IsoDate {
  const [thisYear, thisMonth, thisDay] = today.split("-").map(Number) as [number, number, number];
  const [year, month] = thisMonth > 2 ? [thisYear, thisMonth - 2] : [thisYear - 1, thisMonth + 10];
  return isoDate(year, month, Math.min(thisDay, daysIn(year, month)));
}

function lastDayOf(year: number, month: number): IsoDate {
  return isoDate(year, month, daysIn(year, month));
}

function daysIn(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function isoDate(year: number, month: number, day: number): IsoDate {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
