import { monthEndsFrom, type YearMonth } from "./netWorth.js";
import type { Category, CategorisationRule, CategoryKind } from "./rules.js";
import type { Direction, IsoDate, Pence, StatementTransaction } from "./statements.js";

/** A Transaction from any Statement, tagged with the Account it belongs to and the Statement file it came from. */
export type Transaction = StatementTransaction & { statement: string; account: string };

/** One Category's figure for a month, and each of its Subcategories' in the order the rules file lists them, each with the Transactions behind it. */
export type CategoryTotal = {
  name: string;
  total: Pence;
  transactions: Transaction[];
  subcategories: { name: string; pence: Pence; transactions: Transaction[] }[];
};

/** A month's Spending or Earnings: by Category, Uncategorised with the Transactions behind it, and in total. */
export type Breakdown = { total: Pence; uncategorised: Pence; uncategorisedTransactions: Transaction[]; categories: CategoryTotal[] };

/** One month's Spending and Earnings, and its Net: Earnings minus Spending. */
export type SpendingMonth = {
  monthEnd: IsoDate;
  /** The current month, which is not over yet. */
  partial: boolean;
  spending: Breakdown;
  earnings: Breakdown;
  net: Pence;
  /** How the month differs from the months before it, for a full month with an earlier month since Tracking Start. */
  whatChanged: WhatChanged | undefined;
};

/**
 * A full month against the average of up to 3 months before it since Tracking Start: each Subcategory's change, largest
 * first, and the month's largest single Spending Transactions.
 */
export type WhatChanged = { comparedWith: IsoDate[]; changes: SubcategoryChange[]; largest: Transaction[] };

/**
 * One Subcategory's figure in a month, or Uncategorised's, against its average over the months compared with, rounded
 * to the penny, with the month's Transactions behind it.
 */
export type SubcategoryChange = {
  kind: CategoryKind;
  /** The Category, or none for Uncategorised. */
  category: string | undefined;
  subcategory: string;
  pence: Pence;
  average: Pence;
  change: Pence;
  transactions: Transaction[];
};

/** Every Uncategorised Transaction with one description and direction, and their total. */
export type UncategorisedDescription = { description: string; direction: Direction; pence: Pence; transactions: Transaction[] };

export type SpendingInput = {
  /** Every Transaction from every Statement, each Statement's Transactions in the order it lists them. */
  transactions: Transaction[];
  categories: Category[];
  /** The Categorisation Rules, in the order the rules file lists them. */
  rules: CategorisationRule[];
  trackingStart: YearMonth;
  today: IsoDate;
};

/** A Transaction and the first Categorisation Rule matching it, if any. */
type Matched = { transaction: Transaction; rule: CategorisationRule | undefined };

/**
 * Spending and Earnings for each month from Tracking Start through the current month, sorted into Categories by the
 * Categorisation Rules, and the Uncategorised descriptions across those months, largest total first.
 */
export function calculateSpending({ transactions, categories, rules, trackingStart, today }: SpendingInput): {
  months: SpendingMonth[];
  uncategorised: UncategorisedDescription[];
} {
  const monthEnds = monthEndsFrom(trackingStart, today);
  const shown = new Set(monthEnds.map((monthEnd) => monthEnd.slice(0, 7)));
  const matched = withoutOverlaps(transactions)
    .filter(({ date }) => shown.has(date.slice(0, 7)))
    .map((transaction): Matched => ({ transaction, rule: firstMatch(rules, transaction) }));
  const months = monthEnds.map((monthEnd) => {
    const inMonth = matched.filter(({ transaction }) => transaction.date.slice(0, 7) === monthEnd.slice(0, 7));
    const spending = breakdown("Spending", categories, inMonth);
    const earnings = breakdown("Earnings", categories, inMonth);
    const partial = monthEnd.slice(0, 7) === today.slice(0, 7);
    return { monthEnd, partial, spending, earnings, net: earnings.total - spending.total };
  });
  return {
    months: months.map((month, i): SpendingMonth => ({
      ...month,
      whatChanged: month.partial || i === 0 ? undefined : whatChanged(month, months.slice(Math.max(0, i - COMPARED_MONTHS), i)),
    })),
    uncategorised: rankedUncategorised(matched),
  };
}

/** How many months before a month its "What changed" compares with, when there are that many since Tracking Start. */
const COMPARED_MONTHS = 3;

type MonthFigures = Omit<SpendingMonth, "whatChanged">;

function whatChanged(month: MonthFigures, earlier: MonthFigures[]): WhatChanged {
  const changes = (["Spending", "Earnings"] as const).flatMap((kind) => {
    const breakdownOf = (m: MonthFigures) => (kind === "Spending" ? m.spending : m.earnings);
    // Every month lists the same Subcategories in the same order, then Uncategorised, so lines pair up by position.
    const subcategoryLines = (m: MonthFigures): Omit<SubcategoryChange, "kind" | "average" | "change">[] => [
      ...breakdownOf(m).categories.flatMap(({ name, subcategories }) =>
        subcategories.map(({ name: subcategory, pence, transactions }) => ({ category: name, subcategory, pence, transactions })),
      ),
      { category: undefined, subcategory: "Uncategorised", pence: breakdownOf(m).uncategorised, transactions: breakdownOf(m).uncategorisedTransactions },
    ];
    const earlierLines = earlier.map(subcategoryLines);
    return subcategoryLines(month).map((line, position): SubcategoryChange => {
      const average = Math.round(earlierLines.reduce((total, lines) => total + lines[position]!.pence, 0) / earlier.length);
      return { kind, ...line, average, change: line.pence - average };
    });
  });
  // A stable sort, so equal changes keep the order the rules file lists them.
  changes.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
  const spent = [...month.spending.categories.flatMap((c) => c.transactions), ...month.spending.uncategorisedTransactions];
  const largest = spent
    .filter(({ direction }) => direction === "Out")
    .sort((a, b) => b.pence - a.pence)
    .slice(0, LARGEST_TRANSACTIONS);
  return { comparedWith: earlier.map(({ monthEnd }) => monthEnd), changes, largest };
}

/** How many of a month's largest Spending Transactions its "What changed" lists. */
const LARGEST_TRANSACTIONS = 5;

/** Groups the Transactions no rule matches by description and direction, so the largest unsorted money comes first. */
function rankedUncategorised(matched: Matched[]): UncategorisedDescription[] {
  const groups = new Map<string, UncategorisedDescription>();
  for (const { transaction, rule } of matched) {
    if (rule) continue;
    const { description, direction, pence } = transaction;
    const key = [direction, description].join("\n");
    const group = groups.get(key) ?? { description, direction, pence: 0, transactions: [] };
    groups.set(key, { ...group, pence: group.pence + pence, transactions: [...group.transactions, transaction] });
  }
  return [...groups.values()].sort((a, b) => b.pence - a.pence);
}

function firstMatch(rules: CategorisationRule[], { description }: Transaction): CategorisationRule | undefined {
  const lower = description.toLowerCase();
  return rules.find((rule) => lower.includes(rule.contains.toLowerCase()));
}

/**
 * Spending or Earnings by the Categories of that kind. Under a Spending Category, money out is Spending and money in
 * is a Refund reducing it; under an Earnings Category, money in is Earnings and money out reduces it. What no rule
 * matches is Uncategorised: money out under Spending, money in under Earnings.
 */
function breakdown(kind: CategoryKind, categories: Category[], matched: Matched[]): Breakdown {
  const adds = kind === "Spending" ? "Out" : "In";
  const signed = ({ transaction }: Matched) => (transaction.direction === adds ? transaction.pence : -transaction.pence);
  const totals = categories
    .filter((category) => category.kind === kind)
    .map(({ name, subcategories }): CategoryTotal => {
      const inCategory = matched.filter(({ rule }) => rule && "category" in rule && rule.category === name);
      const bySubcategory = subcategories.map((subcategory) => {
        const inSubcategory = inCategory.filter(({ rule }) => rule && "category" in rule && rule.subcategory === subcategory);
        return { name: subcategory, pence: sum(inSubcategory, signed), transactions: transactionsOf(inSubcategory) };
      });
      const total = bySubcategory.reduce((total, s) => total + s.pence, 0);
      return { name, total, transactions: transactionsOf(inCategory), subcategories: bySubcategory };
    });
  const unmatched = matched.filter(({ transaction, rule }) => !rule && transaction.direction === adds);
  const uncategorised = sum(unmatched, signed);
  return {
    total: totals.reduce((total, c) => total + c.total, uncategorised),
    uncategorised,
    uncategorisedTransactions: transactionsOf(unmatched),
    categories: totals,
  };
}

/**
 * Overlapping Statements list some Transactions twice, while one Statement can list two identical Transactions,
 * such as two coffees at the same price on the same day. So a Transaction, identified by its Account, date,
 * description, amount and direction, counts as many times as the one Statement listing it most.
 */
function withoutOverlaps(transactions: Transaction[]): Transaction[] {
  const byIdentity = new Map<string, Map<string, Transaction[]>>();
  for (const t of transactions) {
    const identity = [t.account, t.date, t.description, t.pence, t.direction].join("\n");
    const byStatement = byIdentity.get(identity) ?? new Map<string, Transaction[]>();
    byStatement.set(t.statement, [...(byStatement.get(t.statement) ?? []), t]);
    byIdentity.set(identity, byStatement);
  }
  return [...byIdentity.values()].flatMap((byStatement) =>
    [...byStatement.values()].reduce((most, listed) => (listed.length > most.length ? listed : most)),
  );
}

function transactionsOf(matched: Matched[]): Transaction[] {
  return matched.map(({ transaction }) => transaction);
}

function sum(matched: Matched[], pence: (s: Matched) => Pence): Pence {
  return matched.reduce((total, s) => total + pence(s), 0);
}
