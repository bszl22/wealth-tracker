import { describe, expect, it } from "vitest";
import { readKrooStatement } from "./kroo.js";

// Made-up text in the layout Kroo Statement PDFs extract to. Every figure is invented.
const statement = `Your Flexible Cash ISA
Annual statement
6 April 2025 to 5 April 2026
Overview
Starting balance £1,000.00
Total money in £3,000.00
Total money out £1,500.00
Interest paid £12.34
Closing balance £2,512.34
Transaction details
6 April 2025 to 5 April 2026
Date Description Out In Balance
06 Apr 2025 Opening balance £1,000.00
20 Apr 2025 Added to Cash ISA £500.00 £1,500.00
Deposit interest
01 May 2025 £4.00 £1,504.00
April interest earned
15 Jun 2025 Withdrawn from Cash ISA £200.00 £1,304.00
15 Jun 2025 Withdrawn from Cash ISA £300.00 £1,004.00
Kroo Bank Ltd
Page 1 of 2
Date Description Out In Balance
10 Dec 2025 Added to Cash ISA £2,500.00 £3,504.00
Deposit interest
01 Jan 2026 £8.34 £3,512.34
December interest earned
31 Mar 2026 Withdrawn from Cash ISA £1,000.00 £2,512.34
Closing balance £2,512.34
Financial Services Compensation Scheme (FSCS)
Your deposits are protected up to a total of £120,000 by the Financial Services Compensation Scheme.
`;

describe("readKrooStatement", () => {
  it("returns the Kroo Account as an Asset with its Closing Balance dated at the end of the period", () => {
    const [account] = readKrooStatement(statement);
    expect(account?.name).toBe("Kroo");
    expect(account?.kind).toBe("Asset");
    expect(account?.balances.filter((b) => b.source === "Closing")).toEqual([
      { date: "2026-04-05", pence: 251234, source: "Closing" },
    ]);
  });

  it("returns the Running Balance printed after every Transaction across the year, in the order listed", () => {
    const [account] = readKrooStatement(statement);
    expect(account?.balances.filter((b) => b.source === "Running")).toEqual([
      { date: "2025-04-06", pence: 100000, source: "Running" },
      { date: "2025-04-20", pence: 150000, source: "Running" },
      { date: "2025-05-01", pence: 150400, source: "Running" },
      { date: "2025-06-15", pence: 130400, source: "Running" },
      { date: "2025-06-15", pence: 100400, source: "Running" },
      { date: "2025-12-10", pence: 350400, source: "Running" },
      { date: "2026-01-01", pence: 351234, source: "Running" },
      { date: "2026-03-31", pence: 251234, source: "Running" },
    ]);
  });

  it("fails rather than guessing when the Closing Balance is missing", () => {
    const withoutClosing = statement.replaceAll(/^Closing balance.*$/gm, "");
    expect(() => readKrooStatement(withoutClosing)).toThrow(/Closing Balance/);
  });

  it("fails rather than guessing when a Transaction's Running Balance doesn't follow from the one before", () => {
    const missingTransaction = statement.replace(/^20 Apr 2025 .*$/m, "");
    expect(() => readKrooStatement(missingTransaction)).toThrow(/Running Balances do not add up/);
  });

  it("fails rather than guessing when the last Running Balance doesn't match the Closing Balance", () => {
    const missingLastTransaction = statement.replace(/^31 Mar 2026 .*$/m, "");
    expect(() => readKrooStatement(missingLastTransaction)).toThrow(/Running Balances do not add up/);
  });

  it("fails rather than guessing when no Transaction lines can be found", () => {
    const withoutTransactions = statement.replaceAll(/^\d{2} [A-Z][a-z]{2} \d{4} .*$/gm, "");
    expect(() => readKrooStatement(withoutTransactions)).toThrow(/Running Balance/);
  });
});
