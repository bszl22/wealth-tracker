import { categorise, type Category, type CategorisationRule, type SubscriptionInterval } from "./rules.js";
import type { Transaction } from "./spending.js";
import { daysIn, isoDate, type IsoDate, type Pence } from "./statements.js";

export type { SubscriptionInterval };

/**
 * Spending that repeats on a regular interval for about the same amount, found from its charges or declared on its rule:
 * its name, usual amount, interval, last charge, whether it is current, its yearly cost, whether it was declared, and
 * the Transactions behind it.
 */
export type Subscription = {
  name: string;
  usual: Pence;
  interval: SubscriptionInterval;
  lastCharge: IsoDate;
  /** It charged within its interval plus the grace days before today: the last charge, plus the interval, plus the grace, is on or after today. */
  current: boolean;
  /** The usual amount × 52, 12 or 1. */
  yearlyCost: Pence;
  /** Its rule declares it a Subscription with its interval, rather than it being found from repeating charges. */
  declared: boolean;
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
  today: IsoDate;
};

/**
 * The Subscriptions among the Spending: money out that a Spending Category's rule matches, grouped by that rule, or
 * that no rule matches, grouped by description. A group whose rule declares a Subscription is one from its first charge,
 * at the interval the rule states. Any other group is a Subscription when its charges fall at a regular weekly, monthly
 * or yearly interval, each within 10% of its usual amount, with enough charges to show it repeats.
 */
export function findSubscriptions({ transactions, categories, rules, today }: SubscriptionsInput): Subscriptions {
  const spendingCategories = new Set(categories.filter(({ kind }) => kind === "Spending").map(({ name }) => name));
  const groups = new Map<CategorisationRule | string, { name: string; declared?: SubscriptionInterval; transactions: Transaction[] }>();
  for (const transaction of transactions) {
    if (transaction.direction !== "Out") continue;
    const rule = categorise(rules, transaction);
    if (rule && !("category" in rule && spendingCategories.has(rule.category))) continue;
    const key = rule ?? transaction.description;
    const name = rule && "category" in rule ? `${rule.subcategory} (${rule.contains})` : transaction.description;
    const declared = rule && "category" in rule ? rule.subscription : undefined;
    const group = groups.get(key) ?? { name, declared, transactions: [] };
    group.transactions.push(transaction);
    groups.set(key, group);
  }
  const subscriptions = [...groups.values()]
    .map(({ name, declared, transactions }) => subscription(name, transactions, declared, today))
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

/**
 * The group's Subscription: at the `declared` interval when its rule declares one, or else none when its charges don't
 * repeat regularly for about the same amount.
 */
function subscription(name: string, transactions: Transaction[], declared: SubscriptionInterval | undefined, today: IsoDate): Subscription | undefined {
  const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date));
  // The middle charge, or the lower of the two middle ones, so the usual amount is one actually charged.
  const amounts = sorted.map(({ pence }) => pence).sort((a, b) => a - b);
  const usual = amounts[Math.floor((amounts.length - 1) / 2)]!;
  const found = declared ? INTERVALS.find(({ interval }) => interval === declared) : detected(sorted, usual);
  if (!found) return undefined;
  const lastCharge = sorted.at(-1)!.date;
  const current = addDays(nextDue(lastCharge, found.interval), GRACE_DAYS) >= today;
  const yearlyCost = usual * found.perYear;
  return { name, usual, interval: found.interval, lastCharge, current, yearlyCost, declared: declared !== undefined, transactions: sorted };
}

/** The interval charges in date order repeat at, each within 10% of the usual amount, or none. */
function detected(sorted: Transaction[], usual: Pence) {
  if (sorted.some(({ pence }) => Math.abs(pence - usual) * 10 > usual)) return undefined;
  const gaps = sorted.slice(1).map(({ date }, i) => daysBetween(sorted[i]!.date, date));
  return INTERVALS.find(({ gapDays: [min, max], fewestCharges }) => sorted.length >= fewestCharges && gaps.every((gap) => gap >= min && gap <= max));
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
