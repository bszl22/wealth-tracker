import {
  parsePence,
  StatementReadError,
  toIsoDate,
  type Direction,
  type IsoDate,
  type Pence,
  type StatementAccount,
  type StatementTransaction,
} from "../statements.js";

/**
 * Reads an Amex Statement's text into the Amex Account, a Liability. Amex prints no Running
 * Balance, so the Account gets its Closing Balance alone: the Balance owed, as a positive number.
 * A purchase is money out of the Account, and a payment or other credit money in.
 */
export function readAmexStatement(text: string): StatementAccount[] {
  const end = periodEnd(text);
  const { newCredits, newDebits, closing } = accountSummary(text);
  const transactions = transactionTable(text, end);
  if (total(transactions, "Out") !== newDebits) throw new StatementReadError("Transactions do not add up to New Debits");
  if (total(transactions, "In") !== newCredits) throw new StatementReadError("Transactions do not add up to New Credits");
  return [
    {
      name: "Amex",
      kind: "Liability",
      balances: [{ date: end, pence: closing, source: "Closing" }],
      transactions,
    },
  ];
}

/** The account summary row: Previous Closing Balance - New Credits + New Debits = Closing Balance. */
const SUMMARY_ROW = /^£([\d,]+\.\d{2}) - £([\d,]+\.\d{2}) \+ £([\d,]+\.\d{2}) = £ ?([\d,]+\.\d{2})$/m;
const TABLE_HEADER = "Date Date Transaction Details";
/** A Transaction line: transaction date, processing date, details, any foreign spend, then the amount in pounds. */
const TRANSACTION_LINE =
  /^(?<month>[A-Z][a-z]{2}) (?<day>\d{1,2}) [A-Z][a-z]{2} \d{1,2} (?<details>.+?)(?: \d[\d.,]*[.,]\d{2})? (?<amount>[\d,]+\.\d{2})$/;
/** Marks the Transaction above it, or the section total above it, as a credit. */
const CREDIT_MARK = "CR";
const SECTION_TOTAL = /^Total (?:new spend|of other account) transactions /;

/**
 * Amex lists each Transaction on one line, sometimes with extra lines under it, such as a merchant category,
 * foreign currency details or a flight itinerary, and marks a credit with "CR" on a line after those.
 */
function transactionTable(text: string, end: IsoDate): StatementTransaction[] {
  // A quiet month can list no Transactions, but every Statement prints the table's headings.
  if (!text.includes(TABLE_HEADER)) throw new StatementReadError("No Transaction table found");
  const transactions: StatementTransaction[] = [];
  // The Transaction a "CR" line below would mark, until a section total comes between them.
  let latest: StatementTransaction | undefined;
  for (const line of text.split("\n")) {
    const groups = TRANSACTION_LINE.exec(line)?.groups;
    if (groups) {
      latest = {
        date: transactionDate(groups.day!, groups.month!, end),
        description: groups.details!,
        pence: parsePence(groups.amount!),
        direction: "Out",
      };
      transactions.push(latest);
    } else if (line === CREDIT_MARK && latest) {
      latest.direction = "In";
      latest = undefined;
    } else if (SECTION_TOTAL.test(line)) {
      latest = undefined;
    }
  }
  return transactions;
}

/**
 * Transaction lines carry no year, so it comes from the period's end. A month after the end month, such
 * as December in a period ending in January, falls in the year before.
 */
function transactionDate(day: string, month: string, end: IsoDate): IsoDate {
  const endYear = Number(end.slice(0, 4));
  const sameYear = toIsoDate(day, month, String(endYear));
  return sameYear.slice(0, 7) > end.slice(0, 7) ? toIsoDate(day, month, String(endYear - 1)) : sameYear;
}

function total(transactions: StatementTransaction[], direction: Direction): Pence {
  return transactions.filter((t) => t.direction === direction).reduce((sum, t) => sum + t.pence, 0);
}

/** The account summary row's New Credits, New Debits and Closing Balance, checked to add up. */
function accountSummary(text: string): { newCredits: Pence; newDebits: Pence; closing: Pence } {
  const match = SUMMARY_ROW.exec(text);
  if (!match) throw new StatementReadError("No Closing Balance found");
  const [previous, credits, debits, closing] = match.slice(1).map((money) => parsePence(money!)) as [Pence, Pence, Pence, Pence];
  if (previous - credits + debits !== closing) {
    throw new StatementReadError("The account summary does not add up to the Closing Balance");
  }
  return { newCredits: credits, newDebits: debits, closing };
}

function periodEnd(text: string): IsoDate {
  const match = /^Statement Period From \d{1,2} [A-Za-z]+ to (\d{1,2}) ([A-Za-z]+) (\d{4})$/m.exec(text);
  if (!match) throw new StatementReadError("No Statement period found");
  return toIsoDate(match[1]!, match[2]!, match[3]!);
}
