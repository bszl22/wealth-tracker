import {
  isMoney,
  parsePence,
  singleSpaced,
  StatementReadError,
  toIsoDate,
  type IsoDate,
  type Pence,
  type StatementAccount,
  type StatementBalance,
  type StatementTransaction,
} from "../statements.js";

/** Reads an HSBC Statement's text into the HSBC Account. */
export function readHsbcStatement(text: string): StatementAccount[] {
  const closing = closingBalance(text);
  const { balances, transactions, lastBalance } = transactionTable(text);
  if (lastBalance !== closing) throw new StatementReadError("Running Balances do not add up to the Closing Balance");
  return [
    {
      name: "HSBC",
      kind: "Asset",
      // The Closing Balance comes first so a Running Balance on the same date, listed later, wins.
      balances: [{ date: periodEnd(text), pence: closing, source: "Closing" }, ...balances],
      transactions,
    },
  ];
}

const TABLE_HEADER = "£ Balance";
const TABLE_END = "BALANCE CARRIED FORWARD";
const BROUGHT_FORWARD = "BALANCE BROUGHT FORWARD";
const DATED_LINE = /^(\d{2}) ([A-Z][a-z]{2}) (\d{2}) +/;
/** How far, in characters, an amount's end may sit from its column heading's end. */
const COLUMN_TOLERANCE = 3;

/** Where each amount column of the Transaction table ends, in characters, since HSBC right-aligns its amounts. */
type Columns = { paidOut: number; paidIn: number; balance: number };

/** One table line split into the amounts in its columns and the details left of them. */
type TableLine = { details: string; paidOut?: Pence; paidIn?: Pence; balance?: Pence };

/**
 * Reads the Transaction table. A Transaction's details run over one or more lines, the last holding its
 * amount in the Paid out or Paid in column. HSBC prints a Running Balance only after the last Transaction
 * of each date, and the brought- and carried-forward lines repeat the Balance across page breaks, so the
 * Transactions since each printed Balance are checked to add up to the next.
 */
function transactionTable(text: string): {
  balances: StatementBalance[];
  transactions: StatementTransaction[];
  lastBalance: Pence | undefined;
} {
  const balances: StatementBalance[] = [];
  const transactions: StatementTransaction[] = [];
  let lastBalance: Pence | undefined;
  let unchecked: StatementTransaction[] = [];
  const check = (balance: Pence) => {
    if (lastBalance === undefined && unchecked.length > 0) {
      throw new StatementReadError("A Transaction appears before the first Balance");
    }
    const change = unchecked.reduce((total, t) => total + (t.direction === "In" ? t.pence : -t.pence), 0);
    if (lastBalance !== undefined && lastBalance + change !== balance) {
      throw new StatementReadError("Transactions do not add up to the Running Balances");
    }
    transactions.push(...unchecked);
    unchecked = [];
    lastBalance = balance;
  };

  let columns: Columns | undefined;
  let date: IsoDate | undefined;
  let description: string[] = [];
  for (const line of text.split("\n")) {
    if (line.includes(TABLE_HEADER)) {
      columns = tableColumns(line);
      continue;
    }
    if (!columns) continue;
    const dated = DATED_LINE.exec(line);
    if (dated) date = toIsoDate(dated[1]!, dated[2]!, dated[3]!);
    // The date is blanked out rather than removed, so the amounts stay under their columns.
    const { details, paidOut, paidIn, balance } = splitColumns(line.replace(DATED_LINE, (date) => " ".repeat(date.length)), columns);
    if (line.includes(TABLE_END) || line.includes(BROUGHT_FORWARD)) {
      if (balance === undefined) throw new StatementReadError("A brought or carried forward Balance could not be read");
      check(balance);
      // A Transaction's details can run on past a page break, so its description carries over.
      if (line.includes(TABLE_END)) columns = undefined;
      continue;
    }
    if (details) description.push(details);
    if (paidOut !== undefined && paidIn !== undefined) {
      throw new StatementReadError("A Transaction has both a paid out and a paid in figure");
    }
    const pence = paidOut ?? paidIn;
    if (pence !== undefined) {
      if (!date) throw new StatementReadError("A Transaction appears before any date");
      unchecked.push({ date, description: description.join(" "), pence, direction: paidIn === undefined ? "Out" : "In" });
      description = [];
    }
    if (balance !== undefined) {
      if (!date) throw new StatementReadError("A Running Balance appears before any date");
      balances.push({ date, pence: balance, source: "Running" });
      check(balance);
    }
  }
  if (lastBalance === undefined) throw new StatementReadError("No Transaction table found");
  if (unchecked.length > 0) throw new StatementReadError("A Transaction has no Running Balance after it");
  return { balances, transactions, lastBalance };
}

function tableColumns(header: string): Columns {
  const end = (heading: string) => {
    const at = header.lastIndexOf(heading);
    if (at < 0) throw new StatementReadError(`No "${heading}" column found`);
    return at + heading.length;
  };
  return { paidOut: end("Paid out"), paidIn: end("Paid in"), balance: end("Balance") };
}

/** Money ending under a column heading is that column's amount. Any other money, such as a foreign currency's, is part of the details. */
function splitColumns(line: string, columns: Columns): TableLine {
  const split: TableLine = { details: "" };
  const details: string[] = [];
  for (const { 0: token, index } of line.matchAll(/\S+/g)) {
    const end = index + token.length;
    const column = isMoney(token)
      ? (Object.keys(columns) as (keyof Columns)[]).find((name) => Math.abs(columns[name] - end) <= COLUMN_TOLERANCE)
      : undefined;
    if (column) split[column] = parsePence(token);
    else details.push(token);
  }
  split.details = details.join(" ");
  return split;
}

// PDF extraction splits some words and amounts with stray spaces, e.g. "Clos ing Balance £539 .0 0".
function closingBalance(text: string): Pence {
  const match = /C\s*l\s*o\s*s\s*i\s*n\s*g\s+B\s*a\s*l\s*a\s*n\s*c\s*e\s+£([\d,. ]+)/.exec(text);
  if (!match) throw new StatementReadError("No Closing Balance found");
  return parsePence(match[1]!.replaceAll(" ", ""));
}

function periodEnd(text: string): IsoDate {
  const match = /^\d{1,2} [A-Za-z]+(?: \d{4})? to (\d{1,2}) ([A-Za-z]+) (\d{4})$/m.exec(singleSpaced(text));
  if (!match) throw new StatementReadError("No Statement period found");
  return toIsoDate(match[1]!, match[2]!, match[3]!);
}
