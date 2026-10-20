import { describe, expect, it } from "vitest";
import { readHsbcStatement } from "./hsbc.js";

// HSBC prints each amount right-aligned in its column, so here each one ends where its column's heading ends.
const PAID_OUT = 64;
const PAID_IN = 80;
const BALANCE = 96;

/** One line of the Transaction table, with its amounts in their columns. */
function row(details: string, amounts: { paidOut?: string; paidIn?: string; balance?: string } = {}): string {
  let line = details;
  for (const [amount, end] of [
    [amounts.paidOut, PAID_OUT],
    [amounts.paidIn, PAID_IN],
    [amounts.balance, BALANCE],
  ] as const) {
    if (amount) line = line.padEnd(end - amount.length) + amount;
  }
  return line;
}

const HEADER = row("Date Pay m e nt t y pe and de t ails", { paidOut: "£ Paid out", paidIn: "£ Paid in", balance: "£ Balance" });

// Made-up text in the layout HSBC Statement PDFs extract to. Every figure is invented.
const statement = `Your HSBC Premier Statement
Account Summary
Ope ning Balance £1,000.00
Paym e nts In £2,500.00
Paym e nts Out £1,250.50
Clos ing Balance £2,249.50
28 January to 27 February 2026
Your Premier Bank Account details
${HEADER}
${row("27 Jan 26 BALANCE BROUGHT FORWARD .", { balance: "1,000.00" })}
28 Jan 26 VIS CORNER SHOP
${row("          LONDON", { paidOut: "10.00", balance: "990.00" })}
30 Jan 26 CR EMPLOYER LTD
${row("          SALARY", { paidIn: "2,500.00" })}
          ))) COFFEE PLACE
${row("          LONDON", { paidOut: "3.50" })}
          BP LANDLORD
${row("          Rent", { paidOut: "1,200.00", balance: "2,286.50" })}
${row("          BALANCE CARRIED FORWARD", { balance: "2,286.50" })}
Your HSBC Premier Statement
28 January to 27 February 2026
${HEADER}
${row("          BALANCE BROUGHT FORWARD", { balance: "2,286.50" })}
          ))) INT'L 0012345678
          CAFE
          CHF 10.00 @ 1.0500
${row("          Visa Rate", { paidOut: "9.52" })}
          DR Non-Sterling
${row("          Transaction Fee", { paidOut: "0.26", balance: "2,276.72" })}
27 Feb 26 VIS BOOKSHOP
${row("          LONDON", { paidOut: "27.22", balance: "2,249.50" })}
`;

describe("readHsbcStatement", () => {
  it("returns the HSBC Account as an Asset with its Closing Balance dated at the end of the period", () => {
    const [account] = readHsbcStatement(statement);
    expect(account?.name).toBe("HSBC");
    expect(account?.kind).toBe("Asset");
    expect(account?.balances.filter((b) => b.source === "Closing")).toEqual([
      { date: "2026-02-27", pence: 224950, source: "Closing" },
    ]);
  });

  it("returns the Running Balance printed at the end of each date, in the order listed", () => {
    const [account] = readHsbcStatement(statement);
    expect(account?.balances.filter((b) => b.source === "Running")).toEqual([
      { date: "2026-01-28", pence: 99000, source: "Running" },
      { date: "2026-01-30", pence: 228650, source: "Running" },
      { date: "2026-01-30", pence: 227672, source: "Running" },
      { date: "2026-02-27", pence: 224950, source: "Running" },
    ]);
  });

  it("returns each Transaction with its description as printed, amount and direction, in the order listed", () => {
    const [account] = readHsbcStatement(statement);
    expect(account?.transactions).toEqual([
      { date: "2026-01-28", description: "VIS CORNER SHOP LONDON", pence: 1000, direction: "Out" },
      { date: "2026-01-30", description: "CR EMPLOYER LTD SALARY", pence: 250000, direction: "In" },
      { date: "2026-01-30", description: "))) COFFEE PLACE LONDON", pence: 350, direction: "Out" },
      { date: "2026-01-30", description: "BP LANDLORD Rent", pence: 120000, direction: "Out" },
      {
        date: "2026-01-30",
        description: "))) INT'L 0012345678 CAFE CHF 10.00 @ 1.0500 Visa Rate",
        pence: 952,
        direction: "Out",
      },
      { date: "2026-01-30", description: "DR Non-Sterling Transaction Fee", pence: 26, direction: "Out" },
      { date: "2026-02-27", description: "VIS BOOKSHOP LONDON", pence: 2722, direction: "Out" },
    ]);
  });

  it("takes each direction from the column its amount is printed in, even when the Running Balances would add up either way", () => {
    // Every figure and description is invented.
    const sameAmountBothWays = `Clos ing Balance £990.00
1 March to 31 March 2026
${HEADER}
${row("01 Mar 26 BALANCE BROUGHT FORWARD .", { balance: "1,000.00" })}
02 Mar 26 BP FRIEND
${row("          SPLIT BILL", { paidOut: "25.00" })}
          BP ANOTHER FRIEND
${row("          REPAID", { paidIn: "25.00" })}
${row("          ))) COFFEE PLACE", { paidOut: "10.00", balance: "990.00" })}
`;
    const [account] = readHsbcStatement(sameAmountBothWays);
    expect(account?.transactions.map((t) => [t.description, t.direction])).toEqual([
      ["BP FRIEND SPLIT BILL", "Out"],
      ["BP ANOTHER FRIEND REPAID", "In"],
      ["))) COFFEE PLACE", "Out"],
    ]);
  });

  it("reads money printed among the details, such as a foreign currency's amount, as part of the description", () => {
    const rateOnNextLine = statement.replace("CHF 10.00 @ 1.0500", "CHF 10.00\n          @ 1.0500");
    expect(readHsbcStatement(rateOnNextLine)).toEqual(readHsbcStatement(statement));
  });

  it("reads a cash machine's charge as part of the description, since the Transaction's amount includes it", () => {
    // Every figure and description is invented.
    const cashWithCharge = statement.replace(
      `28 Jan 26 VIS CORNER SHOP\n${row("          LONDON", { paidOut: "10.00", balance: "990.00" })}`,
      `28 Jan 26 ATM CASH MACHINE JAN28\n          EUROS CHG 1.65\n${row("          PARIS, @18:48", { paidOut: "10.00", balance: "990.00" })}`,
    );
    const [account] = readHsbcStatement(cashWithCharge);
    expect(account?.transactions[0]).toEqual({
      date: "2026-01-28",
      description: "ATM CASH MACHINE JAN28 EUROS CHG 1.65 PARIS, @18:48",
      pence: 1000,
      direction: "Out",
    });
  });

  it("fails rather than guessing when a date's Transactions don't add up to its Running Balance", () => {
    const misread = statement.replace(row("          LONDON", { paidOut: "3.50" }), row("          LONDON", { paidIn: "3.50" }));
    expect(() => readHsbcStatement(misread)).toThrow("Transactions do not add up to the Running Balances");
  });

  it("fails rather than guessing when the Running Balances don't end at the Closing Balance", () => {
    const misread = statement.replace("Clos ing Balance £2,249.50", "Clos ing Balance £2,249.60");
    expect(() => readHsbcStatement(misread)).toThrow("Running Balances do not add up to the Closing Balance");
  });

  it("keeps a description that runs on past a page break", () => {
    const splitAtPageBreak = statement.replace(
      `          DR Non-Sterling\n${row("          Transaction Fee", { paidOut: "0.26", balance: "2,276.72" })}\n27 Feb 26 VIS BOOKSHOP\n`,
      `          DR Non-Sterling\n${row("          Transaction Fee", { paidOut: "0.26", balance: "2,276.72" })}\n27 Feb 26 VIS BOOKSHOP\n${row("          BALANCE CARRIED FORWARD", { balance: "2,276.72" })}\nYour HSBC Premier Statement\n${HEADER}\n${row("          BALANCE BROUGHT FORWARD", { balance: "2,276.72" })}\n`,
    );
    expect(readHsbcStatement(splitAtPageBreak)).toEqual(readHsbcStatement(statement));
  });

  it("fails rather than guessing when the last Transaction has no Running Balance after it", () => {
    const unfinished = statement.replace(row("          LONDON", { paidOut: "27.22", balance: "2,249.50" }), row("          LONDON", { paidOut: "27.22" }));
    expect(() => readHsbcStatement(unfinished)).toThrow("A Transaction has no Running Balance after it");
  });

  it("fails rather than guessing when the Transaction table is missing", () => {
    const withoutTable = statement.replaceAll(HEADER, "");
    expect(() => readHsbcStatement(withoutTable)).toThrow("No Transaction table found");
  });

  it("fails rather than guessing when the Closing Balance is missing", () => {
    const withoutSummary = statement.replace(/^Clos ing Balance.*$/m, "");
    expect(() => readHsbcStatement(withoutSummary)).toThrow(/Closing Balance/);
  });
});
