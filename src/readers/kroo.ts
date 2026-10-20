import {
  parsePence,
  StatementReadError,
  toIsoDate,
  type IsoDate,
  type Pence,
  type StatementAccount,
  type StatementBalance,
  type StatementTransaction,
} from "../statements.js";

/** Reads a Kroo Statement's text into the Kroo Account. */
export function readKrooStatement(text: string): StatementAccount[] {
  const closing = closingBalance(text);
  const { balances: running, transactions } = transactionTable(text);
  if (running.at(-1)!.pence !== closing) throw new StatementReadError("Running Balances do not add up");
  return [
    {
      name: "Kroo",
      kind: "Asset",
      // The Closing Balance comes first so a Running Balance on the same date, listed later, wins.
      balances: [{ date: periodEnd(text), pence: closing, source: "Closing" }, ...running],
      transactions,
    },
  ];
}

const TABLE_HEADER = "Date Description Out In Balance";
const TRANSACTION_LINE =
  /^(?<day>\d{2}) (?<month>[A-Z][a-z]{2}) (?<year>\d{4}) (?<details>.*?)(?:£(?<transaction>[\d,]+\.\d{2}) )?£(?<balance>[\d,]+\.\d{2})$/;

/**
 * Kroo prints each Transaction on one dated line ending in its amount and Running Balance, after the
 * opening balance line, which has a Running Balance only. An interest line's description sits on the
 * line before it. Each Running Balance must differ from the one before by the Transaction's amount, so a
 * line the pattern misses can't go unnoticed, and whether it rose or fell gives the direction.
 */
function transactionTable(text: string): { balances: StatementBalance[]; transactions: StatementTransaction[] } {
  const balances: StatementBalance[] = [];
  const transactions: StatementTransaction[] = [];
  let lineBefore = "";
  for (const line of text.split("\n")) {
    const groups = TRANSACTION_LINE.exec(line)?.groups;
    const descriptionLine = lineBefore;
    lineBefore = line;
    if (!groups) continue;
    const date = toIsoDate(groups.day!, groups.month!, groups.year!);
    const pence = parsePence(groups.balance!);
    const previous = balances.at(-1);
    if (previous) {
      if (!groups.transaction) throw new StatementReadError("A Running Balance has no Transaction beside it");
      const amount = parsePence(groups.transaction);
      if (Math.abs(pence - previous.pence) !== amount) throw new StatementReadError("Running Balances do not add up");
      const direction = pence > previous.pence ? "In" : "Out";
      transactions.push({ date, description: description(groups.details!, descriptionLine), pence: amount, direction });
    } else if (groups.transaction) {
      throw new StatementReadError("A Transaction appears before the first Balance");
    }
    balances.push({ date, pence, source: "Running" });
  }
  // Every Kroo Statement lists at least its opening balance, so none means the layout has changed.
  if (balances.length === 0) throw new StatementReadError("No Running Balances found");
  return { balances, transactions };
}

/** A Transaction's description as printed on its own line, or else on the line before it, which must not be another Transaction or the column headings. */
function description(details: string, lineBefore: string): string {
  if (details.trim()) return details.trim();
  if (!lineBefore.trim() || TRANSACTION_LINE.test(lineBefore) || lineBefore.startsWith(TABLE_HEADER)) {
    throw new StatementReadError("A Transaction has no description");
  }
  return lineBefore.trim();
}

function closingBalance(text: string): Pence {
  const match = /^Closing balance £([\d,]+\.\d{2})$/m.exec(text);
  if (!match) throw new StatementReadError("No Closing Balance found");
  return parsePence(match[1]!);
}

function periodEnd(text: string): IsoDate {
  const match = /^\d{1,2} [A-Za-z]+ \d{4} to (\d{1,2}) ([A-Za-z]+) (\d{4})$/m.exec(text);
  if (!match) throw new StatementReadError("No Statement period found");
  return toIsoDate(match[1]!, match[2]!, match[3]!);
}
