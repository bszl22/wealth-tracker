import { monthEndsFrom, type YearMonth } from "./netWorth.js";
import type { Category, CategorisationRule, CategoryKind } from "./rules.js";
import type { IsoDate, Pence, StatementTransaction } from "./statements.js";

/** A Transaction from any Statement, tagged with the Account it belongs to and the Statement file it came from. */
export type Transaction = StatementTransaction & { statement: string; account: string };

/** One Category's figure for a month, and each of its Subcategories' in the order the rules file lists them. */
export type CategoryTotal = { name: string; total: Pence; subcategories: { name: string; pence: Pence }[] };

/** A month's Spending or Earnings: by Category, Uncategorised, and in total. */
export type Breakdown = { total: Pence; uncategorised: Pence; categories: CategoryTotal[] };

/** One month's Spending and Earnings, and its Net: Earnings minus Spending. */
export type SpendingMonth = {
  monthEnd: IsoDate;
  /** The current month, which is not over yet. */
  partial: boolean;
  spending: Breakdown;
  earnings: Breakdown;
  net: Pence;
};

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

/** Spending and Earnings for each month from Tracking Start through the current month, sorted into Categories by the Categorisation Rules. */
export function calculateSpending({ transactions, categories, rules, trackingStart, today }: SpendingInput): { months: SpendingMonth[] } {
  const matched = withoutOverlaps(transactions).map((transaction): Matched => ({ transaction, rule: firstMatch(rules, transaction) }));
  const months = monthEndsFrom(trackingStart, today).map((monthEnd): SpendingMonth => {
    const inMonth = matched.filter(({ transaction }) => transaction.date.slice(0, 7) === monthEnd.slice(0, 7));
    const spending = breakdown("Spending", categories, inMonth);
    const earnings = breakdown("Earnings", categories, inMonth);
    const partial = monthEnd.slice(0, 7) === today.slice(0, 7);
    return { monthEnd, partial, spending, earnings, net: earnings.total - spending.total };
  });
  return { months };
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
      const bySubcategory = subcategories.map((subcategory) => ({
        name: subcategory,
        pence: sum(
          matched.filter(({ rule }) => rule && "category" in rule && rule.category === name && rule.subcategory === subcategory),
          signed,
        ),
      }));
      return { name, total: bySubcategory.reduce((total, s) => total + s.pence, 0), subcategories: bySubcategory };
    });
  const uncategorised = sum(matched.filter(({ transaction, rule }) => !rule && transaction.direction === adds), signed);
  return { total: totals.reduce((total, c) => total + c.total, uncategorised), uncategorised, categories: totals };
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

function sum(matched: Matched[], pence: (s: Matched) => Pence): Pence {
  return matched.reduce((total, s) => total + pence(s), 0);
}
