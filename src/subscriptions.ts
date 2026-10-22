import { categorise, type Category, type CategorisationRule } from "./rules.js";
import type { Transaction } from "./spending.js";
import { daysIn, isoDate, type IsoDate, type Pence } from "./statements.js";

export type SubscriptionInterval = "Weekly" | "Monthly" | "Yearly";

/**
 * Spending that repeats on a regular interval for about the same amount: its name, usual amount, interval, last charge,
 * whether it is current, its yearly cost, and the Transactions behind it.
 */
export type Subscription = {
  name: string;
  usual: Pence;
  interval: SubscriptionInterval;
  lastCharge: IsoDate;
  /**
   * It has not stopped charging, as far as its Account's Statements reach: its next charge, plus the grace days, falls after
   * the latest Transaction date found for its Account. Today plays no part, so Statements behind today don't make it lapsed.
   */
  current: boolean;
  /** The usual amount × 52, 12 or 1. */
  yearlyCost: Pence;
  transactions: Transaction[];
};

/** Current Subscriptions then lapsed ones, each largest yearly cost first, and the total yearly cost of the current ones. */
export type Subscriptions = { subscriptions: Subscription[]; currentYearlyCost: Pence };

export type SubscriptionsInput = {
  /** Every Transaction from every Statement, counted once where Statements overlap. */
  transactions: Transaction[];
  categories: Category[];
  /** The Categorisation Rules, in the order the rules file lists them. */
  rules: CategorisationRule[];
  /** Not used to judge current or lapsed, which goes by how far each Account's Statements reach. */
  today: IsoDate;
};

/**
 * The Subscriptions among the Spending: money out that a Spending Category's rule matches, grouped by that rule, or
 * that no rule matches, grouped by description. A group is a Subscription when its charges fall at a regular weekly,
 * monthly or yearly interval, each within 10% of its usual amount, with enough charges to show it repeats.
 */
export function findSubscriptions({ transactions, categories, rules }: SubscriptionsInput): Subscriptions {
  const coveredTo = latestDateByAccount(transactions);
  const spendingCategories = new Set(categories.filter(({ kind }) => kind === "Spending").map(({ name }) => name));
  const groups = new Map<CategorisationRule | string, { name: string; transactions: Transaction[] }>();
  for (const transaction of transactions) {
    if (transaction.direction !== "Out") continue;
    const rule = categorise(rules, transaction);
    if (rule && !("category" in rule && spendingCategories.has(rule.category))) continue;
    const key = rule ?? transaction.description;
    const name = rule && "category" in rule ? `${rule.subcategory} (${rule.contains})` : transaction.description;
    const group = groups.get(key) ?? { name, transactions: [] };
    group.transactions.push(transaction);
    groups.set(key, group);
  }
  const subscriptions = [...groups.values()]
    .map(({ name, transactions }) => subscription(name, transactions, coveredTo.get(transactions[0]!.account)!))
    .filter((found): found is Subscription => found !== undefined)
    // A stable sort, so equal yearly costs keep the order found.
    .sort((a, b) => Number(b.current) - Number(a.current) || b.yearlyCost - a.yearlyCost);
  const currentYearlyCost = subscriptions.filter(({ current }) => current).reduce((total, { yearlyCost }) => total + yearlyCost, 0);
  return { subscriptions, currentYearlyCost };
}

/** Each interval: the days between charges it allows, the fewest charges that show it repeats, and charges a year. */
const INTERVALS: { interval: SubscriptionInterval; gapDays: [min: number, max: number]; fewestCharges: number; perYear: number }[] = [
  { interval: "Weekly", gapDays: [5, 9], fewestCharges: 3, perYear: 52 },
  { interval: "Monthly", gapDays: [25, 35], fewestCharges: 3, perYear: 12 },
  { interval: "Yearly", gapDays: [350, 380], fewestCharges: 2, perYear: 1 },
];

/** How many days after a Subscription's next charge is due it still counts as current. */
const GRACE_DAYS = 7;

/** The latest Transaction date found for each Account: how far its Statements reach. */
function latestDateByAccount(transactions: Transaction[]): Map<string, IsoDate> {
  const latest = new Map<string, IsoDate>();
  for (const { account, date } of transactions) if (date > (latest.get(account) ?? "")) latest.set(account, date);
  return latest;
}

/**
 * The group's Subscription, or none when its charges don't repeat regularly for about the same amount. `coveredTo` is
 * the latest Transaction date for the group's Account.
 */
function subscription(name: string, transactions: Transaction[], coveredTo: IsoDate): Subscription | undefined {
  const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date));
  // The middle charge, or the lower of the two middle ones, so the usual amount is one actually charged.
  const amounts = sorted.map(({ pence }) => pence).sort((a, b) => a - b);
  const usual = amounts[Math.floor((amounts.length - 1) / 2)]!;
  if (amounts.some((pence) => Math.abs(pence - usual) * 10 > usual)) return undefined;
  const gaps = sorted.slice(1).map(({ date }, i) => daysBetween(sorted[i]!.date, date));
  const found = INTERVALS.find(
    ({ gapDays: [min, max], fewestCharges }) => sorted.length >= fewestCharges && gaps.every((gap) => gap >= min && gap <= max),
  );
  if (!found) return undefined;
  const lastCharge = sorted.at(-1)!.date;
  const current = addDays(nextDue(lastCharge, found.interval), GRACE_DAYS) > coveredTo;
  return { name, usual, interval: found.interval, lastCharge, current, yearlyCost: usual * found.perYear, transactions: sorted };
}

/** When the charge after one on `date` is due: a week, a calendar month or a calendar year later, on the month's last day if it is shorter. */
function nextDue(date: IsoDate, interval: SubscriptionInterval): IsoDate {
  if (interval === "Weekly") return addDays(date, 7);
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  const [dueYear, dueMonth] = interval === "Yearly" ? [year + 1, month] : month === 12 ? [year + 1, 1] : [year, month + 1];
  return isoDate(dueYear, dueMonth, Math.min(day, daysIn(dueYear, dueMonth)));
}

const utc = (date: IsoDate) => Date.parse(`${date}T00:00:00Z`);
const DAY_MS = 24 * 60 * 60 * 1000;

function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((utc(to) - utc(from)) / DAY_MS);
}

function addDays(date: IsoDate, days: number): IsoDate {
  return new Date(utc(date) + days * DAY_MS).toISOString().slice(0, 10);
}
