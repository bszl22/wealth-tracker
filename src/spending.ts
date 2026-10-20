import { monthEndsFrom, type YearMonth } from "./netWorth.js";
import type { IsoDate, Pence, StatementTransaction } from "./statements.js";

/** A Transaction from any Statement, tagged with the Account it belongs to and the Statement file it came from. */
export type Transaction = StatementTransaction & { statement: string; account: string };

/** One month's Spending (money out) and Earnings (money in), and its Net: Earnings minus Spending. */
export type SpendingMonth = {
  monthEnd: IsoDate;
  /** The current month, which is not over yet. */
  partial: boolean;
  spending: { uncategorised: Pence };
  earnings: { uncategorised: Pence };
  net: Pence;
};

export type SpendingInput = {
  /** Every Transaction from every Statement, each Statement's Transactions in the order it lists them. */
  transactions: Transaction[];
  trackingStart: YearMonth;
  today: IsoDate;
};

/** Spending and Earnings for each month from Tracking Start through the current month. With no Categorisation Rules yet, all of it is Uncategorised. */
export function calculateSpending({ transactions, trackingStart, today }: SpendingInput): { months: SpendingMonth[] } {
  const counted = withoutOverlaps(transactions);
  const months = monthEndsFrom(trackingStart, today).map((monthEnd): SpendingMonth => {
    const inMonth = counted.filter((t) => t.date.slice(0, 7) === monthEnd.slice(0, 7));
    const spending = sum(inMonth.filter((t) => t.direction === "Out"));
    const earnings = sum(inMonth.filter((t) => t.direction === "In"));
    const partial = monthEnd.slice(0, 7) === today.slice(0, 7);
    return { monthEnd, partial, spending: { uncategorised: spending }, earnings: { uncategorised: earnings }, net: earnings - spending };
  });
  return { months };
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

function sum(transactions: Transaction[]): Pence {
  return transactions.reduce((total, t) => total + t.pence, 0);
}
