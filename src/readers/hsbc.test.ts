import { describe, expect, it } from "vitest";
import { readHsbcStatement } from "./hsbc.js";

// Made-up text in the layout HSBC Statement PDFs extract to. Every figure is invented.
const statement = `Your HSBC Premier Statement
Account Summary
Ope ning Balance £1,000.00
Paym e nts In £2,500.00
Paym e nts Out £1,250.50
Clos ing Balance £2,249.50
28 January to 27 February 2026
Your Premier Bank Account details
Date Pay m e nt t y pe and de t ails £ Paid out £ Paid in £ Balance
27 Jan 26 BALANCE BROUGHT FORWARD . 1,000.00
28 Jan 26 VIS CORNER SHOP
LONDON 10.00 990.00
30 Jan 26 CR EMPLOYER LTD
SALARY 2,500.00
))) COFFEE PLACE
LONDON 3.50
BP LANDLORD
Rent 1,200.00 2,286.50
BALANCE CARRIED FORWARD 2,286.50
Your HSBC Premier Statement
28 January to 27 February 2026
Date Pay m e nt t y pe and de t ails £ Paid out £ Paid in £ Balance
BALANCE BROUGHT FORWARD 2,286.50
))) INT'L 0012345678
CAFE
CHF 10.00 @ 1.0500
Visa Rate 9.52
DR Non-Sterling
Transaction Fee 0.26 2,276.72
27 Feb 26 VIS BOOKSHOP
LONDON 27.22 2,249.50
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

  it("fails rather than guessing when the Closing Balance is missing", () => {
    const withoutSummary = statement.replace(/^Clos ing Balance.*$/m, "");
    expect(() => readHsbcStatement(withoutSummary)).toThrow(/Closing Balance/);
  });
});
