import { describe, expect, it } from "vitest";
import { calculateSpending, type Transaction } from "./spending.js";

// Made-up Transactions. Every description and figure is invented.
const hsbc = (
  date: string,
  direction: Transaction["direction"],
  pence: number,
  description = "VIS CORNER SHOP",
  statement = "HSBC Statements/2026-01.pdf",
): Transaction => ({ statement, account: "HSBC", date, description, pence, direction });

const january2026 = { year: 2026, month: 1 };

describe("calculateSpending", () => {
  it("gives each month from Tracking Start through the current month its Uncategorised Spending, Uncategorised Earnings and Net", () => {
    const transactions = [
      hsbc("2025-12-31", "Out", 99999),
      hsbc("2026-01-03", "Out", 1050),
      hsbc("2026-01-20", "In", 250000, "CR EMPLOYER LTD"),
      hsbc("2026-01-31", "Out", 1),
      hsbc("2026-02-14", "Out", 4500),
    ];
    const { months } = calculateSpending({ transactions, trackingStart: january2026, today: "2026-03-02" });
    expect(months.map(({ monthEnd, spending, earnings, net }) => ({ monthEnd, spending, earnings, net }))).toEqual([
      { monthEnd: "2026-01-31", spending: { uncategorised: 1051 }, earnings: { uncategorised: 250000 }, net: 248949 },
      { monthEnd: "2026-02-28", spending: { uncategorised: 4500 }, earnings: { uncategorised: 0 }, net: -4500 },
      { monthEnd: "2026-03-31", spending: { uncategorised: 0 }, earnings: { uncategorised: 0 }, net: 0 },
    ]);
  });

  it("marks only the current month as partial", () => {
    const { months } = calculateSpending({ transactions: [], trackingStart: january2026, today: "2026-03-02" });
    expect(months.map((m) => [m.monthEnd, m.partial])).toEqual([
      ["2026-01-31", false],
      ["2026-02-28", false],
      ["2026-03-31", true],
    ]);
  });

  it("counts a Transaction found in several Statements as many times as the one Statement listing it most, so overlaps count once and repeats are kept", () => {
    const january = "HSBC Statements/2026-01.pdf";
    const february = "HSBC Statements/2026-02.pdf";
    const coffee = (statement: string) => hsbc("2026-01-27", "Out", 320, "))) COFFEE PLACE", statement);
    const transactions = [
      coffee(january),
      coffee(january),
      coffee(february),
      hsbc("2026-01-27", "Out", 320, "))) OTHER CAFE", february),
      hsbc("2026-01-27", "In", 320, "))) COFFEE PLACE", february),
      { ...coffee(february), account: "Kroo" },
    ];
    const { months } = calculateSpending({ transactions, trackingStart: january2026, today: "2026-01-31" });
    expect(months[0]?.spending.uncategorised).toBe(320 * 4);
    expect(months[0]?.earnings.uncategorised).toBe(320);
  });
});
