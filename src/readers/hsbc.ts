import {
  isMoney,
  parsePence,
  StatementReadError,
  toIsoDate,
  type IsoDate,
  type Pence,
  type StatementAccount,
  type StatementBalance,
} from "../statements.js";

/** Reads an HSBC Statement's text into the HSBC Account. */
export function readHsbcStatement(text: string): StatementAccount[] {
  return [
    {
      name: "HSBC",
      kind: "Asset",
      // The Closing Balance comes first so a Running Balance on the same date, listed later, wins.
      balances: [
        { date: periodEnd(text), pence: closingBalance(text), source: "Closing" },
        ...runningBalances(text),
      ],
    },
  ];
}

const TABLE_HEADER = "£ Balance";
const TABLE_END = "BALANCE CARRIED FORWARD";
const BROUGHT_FORWARD = "BALANCE BROUGHT FORWARD";
const DATED_LINE = /^(\d{2}) ([A-Z][a-z]{2}) (\d{2}) /;

/**
 * HSBC prints a Running Balance only after the last Transaction of each date, on a line
 * ending in two amounts: the Transaction's amount, then the Balance. The brought- and
 * carried-forward lines only repeat the Balance across page breaks, so they are skipped.
 */
function runningBalances(text: string): StatementBalance[] {
  const balances: StatementBalance[] = [];
  let inTable = false;
  let date: IsoDate | undefined;
  for (const line of text.split("\n")) {
    if (line.includes(TABLE_HEADER)) inTable = true;
    if (!inTable) continue;
    const dated = DATED_LINE.exec(line);
    if (dated) date = toIsoDate(dated[1]!, dated[2]!, dated[3]!);
    if (line.includes(TABLE_END)) {
      inTable = false;
      continue;
    }
    if (line.includes(BROUGHT_FORWARD)) continue;
    const tokens = line.trim().split(/\s+/);
    const [amount, balance] = tokens.slice(-2);
    if (tokens.length < 3 || !isMoney(amount!) || !isMoney(balance!)) continue;
    if (!date) throw new StatementReadError("A Running Balance appears before any date");
    balances.push({ date, pence: parsePence(balance!), source: "Running" });
  }
  return balances;
}

// PDF extraction splits some words and amounts with stray spaces, e.g. "Clos ing Balance £539 .0 0".
function closingBalance(text: string): Pence {
  const match = /C\s*l\s*o\s*s\s*i\s*n\s*g\s+B\s*a\s*l\s*a\s*n\s*c\s*e\s+£([\d,. ]+)/.exec(text);
  if (!match) throw new StatementReadError("No Closing Balance found");
  return parsePence(match[1]!.replaceAll(" ", ""));
}

function periodEnd(text: string): IsoDate {
  const match = /^\d{1,2} [A-Za-z]+(?: \d{4})? to (\d{1,2}) ([A-Za-z]+) (\d{4})$/m.exec(text);
  if (!match) throw new StatementReadError("No Statement period found");
  return toIsoDate(match[1]!, match[2]!, match[3]!);
}
