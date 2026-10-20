import { describe, expect, it } from "vitest";
import { readAmexStatement } from "./amex.js";

// Made-up text in the layout Amex Statement PDFs extract to. Every figure is invented.
const statement = `American Express®
Credit Card
Statement of Account Page 1 of 5
Account Summary Statement includes payments and charges received by 5 February 2026
Previous Closing Balance New Credits New Debits Closing Balance
£1,200.00 - £1,250.50 + £2,345.67 = £ 2,295.17
Minimum Repayment Payment Due Date
£ 50.00 2 March 2026
Statement Period From 6 January to 5 February 2026
Statement of Account Page 2 of 5
Transaction Process
Date Date Transaction Details Foreign Spend Amount £
Jan 20 Jan 20 PAYMENT RECEIVED - THANK YOU 1,250.50
CR
Jan 7 Jan 8 CORNER SHOP LONDON 12.34
`;

describe("readAmexStatement", () => {
  it("returns the Amex Account as a Liability whose Closing Balance is the Balance owed as a positive number, dated at the end of the period", () => {
    expect(readAmexStatement(statement)).toEqual([
      {
        name: "Amex",
        kind: "Liability",
        balances: [{ date: "2026-02-05", pence: 229517, source: "Closing" }],
        transactions: [],
      },
    ]);
  });

  it("fails rather than guessing when the Previous Closing Balance, New Credits and New Debits don't add up to the Closing Balance", () => {
    const misread = statement.replace("= £ 2,295.17", "= £ 2,259.17");
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
