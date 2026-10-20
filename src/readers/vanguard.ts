import { parsePence, StatementReadError, toIsoDate, type Pence, type StatementAccount } from "../statements.js";

/** The Account each product row of the account summary belongs to. */
const ACCOUNTS: Record<string, string> = {
  ISA: "Vanguard ISA",
  "General Account": "Vanguard General Account",
};

const SUMMARY_HEADER = /^Product Value on .+ Value on (\d{2}) ([A-Za-z]+) (\d{4})$/;
const ACCOUNT_TOTAL = "Account total";
const SUMMARY_ROW = /^(.+?) £([\d,]+\.\d{2}) £([\d,]+\.\d{2})$/;

/**
 * Reads a Vanguard Statement's text into one Account per product in its account summary.
 * Vanguard prints no Running Balance, only each product's valuation at the start and end
 * of the period, so each Account gets its Closing Balance alone.
 */
export function readVanguardStatement(text: string): StatementAccount[] {
  const lines = text.split("\n");
  const headerLine = lines.findIndex((line) => SUMMARY_HEADER.test(line));
  if (headerLine < 0) throw new StatementReadError("No account summary found");
  const [, day, month, year] = SUMMARY_HEADER.exec(lines[headerLine]!)!;
  const date = toIsoDate(day!, month!, year!);
  const totalLine = lines.findIndex((line, i) => i > headerLine && line.startsWith(`${ACCOUNT_TOTAL} `));
  if (totalLine < 0) throw new StatementReadError("No Account total found");

  const accounts = lines.slice(headerLine + 1, totalLine).flatMap((line): StatementAccount[] => {
    const row = SUMMARY_ROW.exec(line);
    if (!row) return [];
    const name = ACCOUNTS[row[1]!];
    if (!name) throw new StatementReadError("The account summary lists an unknown product");
    return [{ name, kind: "Asset", balances: [{ date, pence: closingBalance(row), source: "Closing" }] }];
  });
  const accountTotal = SUMMARY_ROW.exec(lines[totalLine]!);
  const sum = accounts.reduce((pence, account) => pence + account.balances[0]!.pence, 0);
  if (!accountTotal || closingBalance(accountTotal) !== sum) {
    throw new StatementReadError("Closing Balances do not add up to the Account total");
  }
  return accounts;
}

/** A summary row's second amount: the valuation at the end of the period, its Closing Balance. */
function closingBalance(row: RegExpExecArray): Pence {
  return parsePence(row[3]!);
}
