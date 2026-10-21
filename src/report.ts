import { calculateNetWorth, type AccountBalance, type MonthEndSnapshot } from "./netWorth.js";
import { loadRules, type Category, type CategorisationRule } from "./rules.js";
import { scanStatements, type ReconciledStatements } from "./scanStatements.js";
import type { Settings } from "./settings.js";
import { calculateSpending, type SpendingMonth, type UncategorisedDescription } from "./spending.js";
import { daysIn, isoDate, type IsoDate, type Pence } from "./statements.js";

export type YearMonth = { year: number; month: number };

export type ReportInput = {
  statements: ReconciledStatements;
  categories: Category[];
  rules: CategorisationRule[];
  /** Where the rules file is, and whether it was found. */
  rulesFile: { path: string; found: boolean };
  trackingStart: YearMonth;
  today: IsoDate;
  /** Whether `ANTHROPIC_API_KEY` is set, so Suggested Rules can be asked for. Never the key itself. */
  apiKeySet: boolean;
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

/**
 * Everything the page shows: each month from Tracking Start through today, each Account's latest Balance, the
 * Uncategorised Transactions, the rules file's Categories to make rules with, and whether Suggested Rules can be asked
 * for.
 */
export type Report = {
  months: ReportMonth[];
  accounts: AccountBalance[];
  uncategorised: UncategorisedDescription[];
  categories: Category[];
  rulesFile: ReportInput["rulesFile"];
  apiKeySet: boolean;
};

/** What the page receives: the Report, or why it can't be shown. */
export type ReportResponse = Report | { error: string };

/** The Report from the Statements and rules file in the data folder, as of today. */
export async function statementsReport(settings: Settings): Promise<Report> {
  const statements = await scanStatements(settings.dataFolder);
  const { categories, rules, path, found } = await loadRules(settings.dataFolder);
  return buildReport({ statements, categories, rules, rulesFile: { path, found }, trackingStart: settings.trackingStart, today: localToday(), apiKeySet: Boolean(process.env.ANTHROPIC_API_KEY) });
}

export function buildReport({ statements: { balances, transactions }, categories, rules, rulesFile, trackingStart, today, apiKeySet }: ReportInput): Report {
  const monthEnds = monthEndsFrom(trackingStart, today);
  const { snapshots, accounts } = calculateNetWorth({ balances, monthEnds, today });
  const spending = calculateSpending({ transactions, categories, rules, monthEnds, today });
  // Both calculators give one entry per month end, in the order given.
  const months = spending.months.map((month, i): ReportMonth => {
    const snapshot = snapshots[i]!;
    const before = snapshots[i - 1];
    return { ...month, snapshot, netWorthChange: before && netWorthChange(before, snapshot, month.net) };
  });
  return { months, accounts, uncategorised: spending.uncategorised, categories, rulesFile, apiKeySet };
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
    monthEnds.push(isoDate(year, month, daysIn(year, month)));
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
  return isoDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
}
