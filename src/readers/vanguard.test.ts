import { describe, expect, it } from "vitest";
import { readVanguardStatement } from "./vanguard.js";

// Made-up text in the layout Vanguard Statement PDFs extract to. Every figure is invented.
const statement = `Your Regular Statement & Annual Cost and Charges Statement
for 6 October 2025 to 5 January 2026
Please find enclosed your statement which shows the value of your investments on 5
January 2026 and details all transactions over the reporting period.
Your Vanguard account summary
Product Value on 06 October 2025 Value on 05 January 2026
ISA £1,000.00 £1,234.56
General Account £500.00 £20,000.01
Account total £1,500.00 £21,234.57
Issued by Vanguard Asset Management, Limited.
Your ISA summary
Your ISA investments at 05 January 2026
Description Quantity Price Value
Vanguard FTSE All-World UCITS ETF (USD) 10.00 £100.00 £1,000.00
Cash account - - £234.56
`;

describe("readVanguardStatement", () => {
  it("returns the Vanguard ISA and the Vanguard General Account as Assets, each with its Closing Balance dated at the end of the period and no Transactions", () => {
    expect(readVanguardStatement(statement)).toEqual([
      {
        name: "Vanguard ISA",
        kind: "Asset",
        balances: [{ date: "2026-01-05", pence: 123456, source: "Closing" }],
        transactions: [],
      },
      {
        name: "Vanguard General Account",
        kind: "Asset",
        balances: [{ date: "2026-01-05", pence: 2000001, source: "Closing" }],
        transactions: [],
      },
    ]);
  });

  it("fails rather than guessing when the Accounts' Closing Balances don't add up to the Account total", () => {
    const missingRow = statement.replace(/^General Account .*$/m, "");
    expect(() => readVanguardStatement(missingRow)).toThrow(/do not add up/);
  });

  it("fails rather than guessing when the account summary is missing", () => {
    const withoutSummary = statement.replace(/^Product Value on .*$/m, "");
    expect(() => readVanguardStatement(withoutSummary)).toThrow(/account summary/);
  });

  it("fails rather than guessing when the account summary has no Account total", () => {
    const withoutTotal = statement.replace(/^Account total .*$/m, "");
    expect(() => readVanguardStatement(withoutTotal)).toThrow(/Account total/);
  });

  it("fails rather than guessing when the account summary lists a product it doesn't know", () => {
    const withPension = statement
      .replace("General Account £500.00 £20,000.01", "General Account £500.00 £20,000.01\nPension £10.00 £10.00")
      .replace("Account total £1,500.00 £21,234.57", "Account total £1,510.00 £21,244.57");
    expect(() => readVanguardStatement(withPension)).toThrow(/unknown product/);
  });
});
