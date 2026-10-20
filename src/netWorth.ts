import type { AccountKind, IsoDate, Pence, StatementBalance } from "./statements.js";

/** A Balance from any Statement, tagged with the Account it belongs to. */
export type Balance = StatementBalance & { account: string; kind: AccountKind };

export type YearMonth = { year: number; month: number };

/** A Liability holds the Balance owed as a positive number, so Net Worth is the Assets less the Liabilities. */
export type MonthEndSnapshot = { monthEnd: IsoDate; assets: Pence; liabilities: Pence; netWorth: Pence };

export type NetWorthInput = {
  /** Every Balance from every Statement, each Statement's Balances in the order it lists them. */
  balances: Balance[];
  trackingStart: YearMonth;
  today: IsoDate;
};

export function calculateNetWorth({ balances, trackingStart, today }: NetWorthInput): {
  snapshots: MonthEndSnapshot[];
} {
  const snapshots = monthEndsFrom(trackingStart, today).map((monthEnd): MonthEndSnapshot => {
    const latest = [...latestBalancesOnOrBefore(balances, monthEnd).values()];
    const assets = sum(latest.filter((b) => b.kind === "Asset"));
    const liabilities = sum(latest.filter((b) => b.kind === "Liability"));
    return { monthEnd, assets, liabilities, netWorth: assets - liabilities };
  });
  return { snapshots };
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

function monthEndsFrom(start: YearMonth, today: IsoDate): IsoDate[] {
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

function lastDayOf(year: number, month: number): IsoDate {
  const day = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, "0")}-${day}`;
}
