import type { AccountBalance, MonthEndSnapshot } from "./netWorth.js";
import type { ReportMonth, YearMonth } from "./report.js";
import type { IsoDate, Pence } from "./statements.js";
import type { Subscriptions } from "./subscriptions.js";

/** A target Net Worth to reach by the end of a chosen month. */
export type Goal = { netWorth: Pence; by: YearMonth };

/** The average change in Net Worth per month over the month ends listed, Other Change included. */
export type Pace = { pence: Pence; months: IsoDate[] };

/** One Spending Category or current Subscription's monthly cost, and the share of the monthly shortfall it equals. */
export type ShortfallLine = { name: string; monthly: Pence; share: number };

/**
 * How far a Pace falls short of the monthly change a Goal needs, beside the largest Spending Categories (averaged over
 * the Pace's months) and the current Subscriptions. Facts only: it never suggests a cut.
 */
export type Shortfall = { pence: Pence; spending: ShortfallLine[]; subscriptions: ShortfallLine[] };

/**
 * Where a Goal stands, from the latest complete Month-End Snapshot: waiting for a complete month, passed (its month is
 * complete), reached, or ahead with the monthly change it needs, the Pace, and where the Pace leads. Every state names the
 * Stale Accounts, whose old Balances can make it look further or nearer than it is.
 */
export type GoalProgress = { goal: Goal; stale: string[] } & (
  | { state: "Waiting" }
  | { state: "Passed"; final: MonthEndSnapshot }
  | { state: "Reached"; from: MonthEndSnapshot }
  | {
      state: "Ahead";
      from: MonthEndSnapshot;
      /** Month ends after the starting one, through the Goal's. */
      monthsLeft: number;
      needed: Pence;
      /** None until a complete month after Tracking Start has a change in Net Worth. */
      pace: Pace | undefined;
      projected: Pence | undefined;
      shortfall: Shortfall | undefined;
    }
);

const PACE_MONTHS = 3;
const SHOWN_CATEGORIES = 5;

export function goalProgress(goal: Goal, months: ReportMonth[], accounts: AccountBalance[], subscriptions: Subscriptions): GoalProgress {
  const stale = accounts.filter((a) => a.stale).map((a) => a.account);
  const complete = months.filter((m) => !m.partial);
  const from = complete.at(-1)?.snapshot;
  if (!from) return { goal, stale, state: "Waiting" };
  const monthsLeft = monthsBetween(yearMonthOf(from.monthEnd), goal.by);
  if (monthsLeft <= 0) {
    const final = complete.find((m) => sameMonth(yearMonthOf(m.monthEnd), goal.by))!.snapshot;
    return { goal, stale, state: "Passed", final };
  }
  if (from.netWorth >= goal.netWorth) return { goal, stale, state: "Reached", from };
  const needed = Math.round((goal.netWorth - from.netWorth) / monthsLeft);
  const paceMonths = complete.filter((m) => m.netWorthChange).slice(-PACE_MONTHS);
  if (paceMonths.length === 0) return { goal, stale, state: "Ahead", from, monthsLeft, needed, pace: undefined, projected: undefined, shortfall: undefined };
  const pace = { pence: Math.round(sum(paceMonths.map((m) => m.netWorthChange!.change)) / paceMonths.length), months: paceMonths.map((m) => m.monthEnd) };
  const projected = from.netWorth + pace.pence * monthsLeft;
  const short = needed - pace.pence;
  const shortfall = short > 0 ? shortfallFrom(short, paceMonths, subscriptions) : undefined;
  return { goal, stale, state: "Ahead", from, monthsLeft, needed, pace, projected, shortfall };
}

/** The largest Spending Categories, averaged over `months` and paired by name, and the current Subscriptions. */
function shortfallFrom(pence: Pence, months: ReportMonth[], { subscriptions }: Subscriptions): Shortfall {
  const line = (name: string, monthly: Pence): ShortfallLine => ({ name, monthly, share: monthly / pence });
  const totals = new Map<string, Pence>();
  for (const month of months) {
    for (const { name, pence: spent } of month.spending.categories) totals.set(name, (totals.get(name) ?? 0) + spent);
  }
  const spending = [...totals]
    .map(([name, total]) => line(name, Math.round(total / months.length)))
    .filter((l) => l.monthly > 0)
    .sort((a, b) => b.monthly - a.monthly)
    .slice(0, SHOWN_CATEGORIES);
  const current = subscriptions.filter((s) => s.current).map((s) => line(s.name, Math.round(s.yearlyCost / 12)));
  return { pence, spending, subscriptions: current.sort((a, b) => b.monthly - a.monthly) };
}

const yearMonthOf = (monthEnd: IsoDate): YearMonth => {
  const [year, month] = monthEnd.split("-").map(Number) as [number, number];
  return { year, month };
};
const monthsBetween = (from: YearMonth, to: YearMonth) => (to.year - from.year) * 12 + to.month - from.month;
const sameMonth = (a: YearMonth, b: YearMonth) => monthsBetween(a, b) === 0;
const sum = (pence: Pence[]) => pence.reduce((total, p) => total + p, 0);
