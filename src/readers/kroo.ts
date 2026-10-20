import {
  parsePence,
  StatementReadError,
  toIsoDate,
  type IsoDate,
  type Pence,
  type StatementAccount,
  type StatementBalance,
} from "../statements.js";

/** Reads a Kroo Statement's text into the Kroo Account. */
export function readKrooStatement(text: string): StatementAccount[] {
  const closing = closingBalance(text);
  const running = runningBalances(text);
  if (running.at(-1)!.pence !== closing) throw new StatementReadError("Running Balances do not add up");
  return [
    {
      name: "Kroo",
      kind: "Asset",
      // The Closing Balance comes first so a Running Balance on the same date, listed later, wins.
      balances: [{ date: periodEnd(text), pence: closing, source: "Closing" }, ...running],
      // Kroo Transactions are not read yet.
      transactions: [],
    },
  ];
}

const TRANSACTION_LINE = /^(\d{2}) ([A-Z][a-z]{2}) (\d{4}) .*?(?:£([\d,]+\.\d{2}) )?£([\d,]+\.\d{2})$/;

/**
 * Kroo prints each Transaction on one dated line ending in its amount and Running Balance,
 * including interest lines (whose description sits on the lines around them). The opening
 * balance line has a Running Balance only. Each Running Balance must differ from the one
 * before by the Transaction's amount, so a line the pattern misses can't go unnoticed.
 */
function runningBalances(text: string): StatementBalance[] {
  const balances: StatementBalance[] = [];
  for (const line of text.split("\n")) {
    const match = TRANSACTION_LINE.exec(line);
    if (!match) continue;
    const pence = parsePence(match[5]!);
    const previous = balances.at(-1);
    if (previous && match[4] && Math.abs(pence - previous.pence) !== parsePence(match[4])) {
      throw new StatementReadError("Running Balances do not add up");
    }
    balances.push({ date: toIsoDate(match[1]!, match[2]!, match[3]!), pence, source: "Running" });
  }
  // Every Kroo Statement lists at least its opening balance, so none means the layout has changed.
  if (balances.length === 0) throw new StatementReadError("No Running Balances found");
  return balances;
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
