import { describe, expect, it } from "vitest";
import { readAmexStatement } from "./amex.js";

// Made-up text in the layout Amex Statement PDFs extract to. Every figure is invented.
const statement = `American Express®
Credit Card
Statement of Account Page 1 of 5
Account Summary Statement includes payments and charges received by 5 February 2026
Previous Closing Balance New Credits New Debits Closing Balance
£1,200.00 - £1,275.50 + £116.96 = £ 41.46
Minimum Repayment Payment Due Date
£ 25.00 2 March 2026
Statement Period From 6 January to 5 February 2026
Statement of Account Page 2 of 5
Transaction Process
Date Date Transaction Details Foreign Spend Amount £
Jan 20 Jan 20 PAYMENT RECEIVED - THANK YOU 1,250.50
CR
Jan 7 Jan 8 CORNER SHOP LONDON 12.34
Jan 9 Jan 9 GREENGROCER LONDON 4.50
GOODS
Jan 10 Jan 11 BOOKSHOP NEW YORK 25.00 20.12
UNITED STATES DOLLAR
Exchange Rate 1.2425 + Nonsterling Transaction Fee .59
How you can pay your statement
You must pay from a personal account in your own name.
Statement of Account Page 3 of 5
Transaction Process
Date Date Transaction Details Foreign Spend Amount £
Jan 12 Jan 13 AIRLINE MADRID 80,00 70.00
EUROPEAN UNION EURO
ROUTING: FROM: MADRID
TO: LONDON CARRIER: XX CLASS: Y
Exchange Rate 1.1429 + Nonsterling Transaction Fee 2.04
Total new spend transactions for A CARDMEMBER 106.96
OTHER ACCOUNT TRANSACTIONS
Jan 15 Jan 15 TAKEAWAY UK 25.00
TakeawayBenefit
CR
Jan 18 Jan 18 ANNUAL FEE 10.00
Total of other account transactions 15.00
CR
`;

describe("readAmexStatement", () => {
  it("returns the Amex Account as a Liability whose Closing Balance is the Balance owed as a positive number, dated at the end of the period", () => {
    const [account] = readAmexStatement(statement);
    expect(account).toMatchObject({
      name: "Amex",
      kind: "Liability",
      balances: [{ date: "2026-02-05", pence: 4146, source: "Closing" }],
    });
  });

  it("returns each Transaction on its transaction date with its amount in pounds, purchases as money out and payments and other credits marked CR as money in", () => {
    expect(readAmexStatement(statement)[0]!.transactions).toEqual([
      { date: "2026-01-20", description: "PAYMENT RECEIVED - THANK YOU", pence: 125050, direction: "In" },
      { date: "2026-01-07", description: "CORNER SHOP LONDON", pence: 1234, direction: "Out" },
      { date: "2026-01-09", description: "GREENGROCER LONDON", pence: 450, direction: "Out" },
      { date: "2026-01-10", description: "BOOKSHOP NEW YORK", pence: 2012, direction: "Out" },
      { date: "2026-01-12", description: "AIRLINE MADRID", pence: 7000, direction: "Out" },
      { date: "2026-01-15", description: "TAKEAWAY UK", pence: 2500, direction: "In" },
      { date: "2026-01-18", description: "ANNUAL FEE", pence: 1000, direction: "Out" },
    ]);
  });

  it("dates Transactions in the year before the period's end when the period runs December into January", () => {
    const decemberToJanuary = statement
      .replace("Statement Period From 6 January to 5 February 2026", "Statement Period From 6 December to 5 January 2026")
      .replace("Jan 7 Jan 8 CORNER SHOP", "Dec 31 Jan 1 CORNER SHOP");
    const dates = readAmexStatement(decemberToJanuary)[0]!.transactions.slice(0, 2).map((t) => t.date);
    expect(dates).toEqual(["2026-01-20", "2025-12-31"]);
  });

  it("fails rather than guessing when the Transactions read as money out don't add up to New Debits", () => {
    const missedLine = statement.replace(/^Jan 9 Jan 9 GREENGROCER .*$/m, "");
    expect(() => readAmexStatement(missedLine)).toThrow(/do not add up to New Debits/);
  });

  it("fails rather than guessing when the Transactions read as money in don't add up to New Credits", () => {
    const missedCredit = statement.replace("Jan 15 Jan 15 TAKEAWAY UK 25.00\nTakeawayBenefit\nCR\n", "");
    expect(() => readAmexStatement(missedCredit)).toThrow(/do not add up to New Credits/);
  });

  it("fails rather than guessing when the Transaction table is missing", () => {
    const withoutTable = statement.replaceAll("Date Date Transaction Details", "");
    expect(() => readAmexStatement(withoutTable)).toThrow(/No Transaction table/);
  });

  it("fails rather than guessing when the Previous Closing Balance, New Credits and New Debits don't add up to the Closing Balance", () => {
    const misread = statement.replace("= £ 41.46", "= £ 14.46");
    expect(() => readAmexStatement(misread)).toThrow(/does not add up/);
  });

  it("fails rather than guessing when the account summary row is missing", () => {
    const withoutSummary = statement.replace(/^£1,200\.00 .*$/m, "");
    expect(() => readAmexStatement(withoutSummary)).toThrow(/No Closing Balance/);
  });

  it("fails rather than guessing when the Statement period is missing", () => {
    const withoutPeriod = statement.replace(/^Statement Period .*$/m, "");
    expect(() => readAmexStatement(withoutPeriod)).toThrow(/No Statement period/);
  });
});
