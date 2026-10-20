import { parsePence, StatementReadError, toIsoDate, type IsoDate, type Pence, type StatementAccount } from "../statements.js";

/**
 * Reads an Amex Statement's text into the Amex Account, a Liability. Amex prints no Running
 * Balance, so the Account gets its Closing Balance alone: the Balance owed, as a positive number.
 */
export function readAmexStatement(text: string): StatementAccount[] {
  return [
    {
      name: "Amex",
      kind: "Liability",
      balances: [{ date: periodEnd(text), pence: closingBalance(text), source: "Closing" }],
    },
  ];
}

// The account summary row: Previous Closing Balance - New Credits + New Debits = Closing Balance.
const SUMMARY_ROW = /^£([\d,]+\.\d{2}) - £([\d,]+\.\d{2}) \+ £([\d,]+\.\d{2}) = £ ?([\d,]+\.\d{2})$/m;

/** The Closing Balance, checked against the rest of the account summary row it closes. */
function closingBalance(text: string): Pence {
  const match = SUMMARY_ROW.exec(text);
  if (!match) throw new StatementReadError("No Closing Balance found");
  const [previous, credits, debits, closing] = match.slice(1).map((money) => parsePence(money!)) as [Pence, Pence, Pence, Pence];
  if (previous - credits + debits !== closing) {
    throw new StatementReadError("The account summary does not add up to the Closing Balance");
  }
  return closing;
}

function periodEnd(text: string): IsoDate {
  const match = /^Statement Period From \d{1,2} [A-Za-z]+ to (\d{1,2}) ([A-Za-z]+) (\d{4})$/m.exec(text);
  if (!match) throw new StatementReadError("No Statement period found");
  return toIsoDate(match[1]!, match[2]!, match[3]!);
}
