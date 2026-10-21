import { calculateNetWorth, type AccountBalance, type Balance, type MonthEndSnapshot } from "./netWorth.js";
import { loadRules, type Category, type CategorisationRule } from "./rules.js";
import { scanStatements } from "./scanStatements.js";
import type { Settings } from "./settings.js";
import { calculateSpending, type SpendingMonth, type Transaction, type UncategorisedDescription } from "./spending.js";
import type { IsoDate, Pence } from "./statements.js";

export type YearMonth = { year: number; month: number };

export type ReportInput = {
  balances: Balance[];
  transactions: Transaction[];
  categories: Category[];
  rules: CategorisationRule[];
  /** Where the rules file is, and whether it was found. */
  rulesFile: { path: string; found: boolean };
  trackingStart: YearMonth;
  today: IsoDate;
};

/**
 * One month from Tracking Start through the current month: its Month-End Snapshot, its Spending and Earnings, and its
 * change in Net Worth broken down, for every month after Tracking Start.
 */
export type ReportMonth = SpendingMonth & { snapshot: MonthEndSnapshot; netWorthChange: NetWorthChange | undefined };

/**
 * A month's change in Net Worth since the Month-End Snapshot before it, as its Net (Earnings minus Spending) plus
 * Other Change. Other Change is one figure, never split by estimation, since only printed Balances are known (ADR 0002).
 */
export type NetWorthChange = { since: IsoDate; change: Pence; net: Pence; otherChange: Pence };

/** Everything the page shows: each month from Tracking Start through today, each Account's latest Balance, and the Uncategorised Transactions. */
export type Report = {
  months: ReportMonth[];
  accounts: AccountBalance[];
  uncategorised: UncategorisedDescription[];
  categories: Category[];
  rulesFile: ReportInput["rulesFile"];
};

/** What the page receives: the Report, or why it can't be shown. */
export type ReportResponse = Report | { error: string };

/** The Report from the Statements and rules file in the data folder, as of today. */
export async function statementsReport(settings: Settings): Promise<Report> {
  const { balances, transactions } = await scanStatements(settings.dataFolder);
  const { categories, rules, path, found } = await loadRules(settings.dataFolder);
  return buildReport({ balances, transactions, categories, rules, rulesFile: { path, found }, trackingStart: settings.trackingStart, today: localToday() });
}

export function buildReport({ balances, transactions, categories, rules, rulesFile, trackingStart, today }: ReportInput): Report {
  const monthEnds = monthEndsFrom(trackingStart, today);
  const { snapshots, accounts } = calculateNetWorth({ balances, monthEnds, today });
  const spending = calculateSpending({ transactions, categories, rules, monthEnds, today });
  // Both calculators give one entry per month end, in the order given.
  const months = spending.months.map((month, i): ReportMonth => {
    const snapshot = snapshots[i]!;
    const before = snapshots[i - 1];
    return { ...month, snapshot, netWorthChange: before && netWorthChange(before, snapshot, month.net) };
  });
  return { months, accounts, uncategorised: spending.uncategorised, categories, rulesFile };
}

function netWorthChange(before: MonthEndSnapshot, after: MonthEndSnapshot, net: Pence): NetWorthChange {
  const change = after.netWorth - before.netWorth;
  return { since: before.monthEnd, change, net, otherChange: change - net };
}

/** The last day of each month from Tracking Start through the month holding today. */
export function monthEndsFrom(start: YearMonth, today: IsoDate): IsoDate[] {
  const [thisYear, thisMonth] = today.split("-").map(Number) as [number, number];
  const monthEnds: IsoDate[] = [];
  let { year, month } = start;
  while (year < thisYear || (year === thisYear && month <= thisMonth)) {
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    monthEnds.push(`${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`);
    if (month === 12) {
      year += 1;
      month = 1;
    } else {
      month += 1;
    }
  }
  return monthEnds;
}

export function localToday(): IsoDate {
  const now = new Date();
  return [now.getFullYear(), now.getMonth() + 1, now.getDate()].map((n) => String(n).padStart(2, "0")).join("-");
}
