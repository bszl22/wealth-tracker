import { describe, expect, it } from "vitest";
import type { Category, CategorisationRule } from "./rules.js";
import { calculateSpending, type SpendingInput, type Transaction } from "./spending.js";

// Made-up Transactions. Every description and figure is invented.
const hsbc = (
  date: string,
  direction: Transaction["direction"],
  pence: number,
  description = "VIS CORNER SHOP",
  statement = "HSBC Statements/2026-01.pdf",
): Transaction => ({ statement, account: "HSBC", date, description, pence, direction });

const january2026 = { year: 2026, month: 1 };

const food: Category = { name: "Food", kind: "Spending", subcategories: ["Groceries", "Eating Out"] };
const work: Category = { name: "Work", kind: "Earnings", subcategories: ["Salary", "Bonus"] };

/** The months for Transactions in January 2026 alone, sorted by these Categories and rules. */
const january = (transactions: Transaction[], categories: Category[], rules: CategorisationRule[]) =>
  calculateSpending({ transactions, categories, rules, trackingStart: january2026, today: "2026-01-31" } satisfies SpendingInput).months[0]!;

const noRules = { categories: [], rules: [] };

describe("calculateSpending", () => {
  it("gives each month from Tracking Start through the current month its Uncategorised Spending, Uncategorised Earnings and Net", () => {
    const transactions = [
      hsbc("2025-12-31", "Out", 99999),
      hsbc("2026-01-03", "Out", 1050),
      hsbc("2026-01-20", "In", 250000, "CR EMPLOYER LTD"),
      hsbc("2026-01-31", "Out", 1),
      hsbc("2026-02-14", "Out", 4500),
    ];
    const { months } = calculateSpending({ transactions, ...noRules, trackingStart: january2026, today: "2026-03-02" });
    expect(
      months.map(({ monthEnd, spending, earnings, net }) => ({ monthEnd, spending: spending.uncategorised, earnings: earnings.uncategorised, net })),
    ).toEqual([
      { monthEnd: "2026-01-31", spending: 1051, earnings: 250000, net: 248949 },
      { monthEnd: "2026-02-28", spending: 4500, earnings: 0, net: -4500 },
      { monthEnd: "2026-03-31", spending: 0, earnings: 0, net: 0 },
    ]);
  });

  it("marks only the current month as partial", () => {
    const { months } = calculateSpending({ transactions: [], ...noRules, trackingStart: january2026, today: "2026-03-02" });
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
    const { months } = calculateSpending({ transactions, ...noRules, trackingStart: january2026, today: "2026-01-31" });
    expect(months[0]?.spending.uncategorised).toBe(320 * 4);
    expect(months[0]?.earnings.uncategorised).toBe(320);
  });

  it("gives each Transaction the Category and Subcategory of the first rule whose text its description contains, ignoring case", () => {
    const rules: CategorisationRule[] = [
      { contains: "corner shop", category: "Food", subcategory: "Groceries" },
      { contains: "Corner", category: "Food", subcategory: "Eating Out" },
    ];
    const month = january([hsbc("2026-01-03", "Out", 1050, "VIS CORNER SHOP"), hsbc("2026-01-04", "Out", 400, "VIS corner cafe")], [food], rules);
    expect(month.spending).toEqual({
      total: 1450,
      uncategorised: 0,
      categories: [
        { name: "Food", total: 1450, subcategories: [{ name: "Groceries", pence: 1050 }, { name: "Eating Out", pence: 400 }] },
      ],
    });
  });

  it("counts money in under a Spending Category as a Refund, reducing Spending in that Category, never Earnings", () => {
    const rules: CategorisationRule[] = [{ contains: "CORNER CAFE", category: "Food", subcategory: "Eating Out" }];
    const month = january([hsbc("2026-01-03", "Out", 1200, "CORNER CAFE"), hsbc("2026-01-05", "In", 450, "CORNER CAFE")], [food, work], rules);
    expect(month.spending.total).toBe(750);
    expect(month.spending.categories[0]).toEqual({
      name: "Food",
      total: 750,
      subcategories: [{ name: "Groceries", pence: 0 }, { name: "Eating Out", pence: 750 }],
    });
    expect(month.earnings.total).toBe(0);
  });

  it("counts money in under an Earnings Category as Earnings, and money out under it as reducing Earnings", () => {
    const rules: CategorisationRule[] = [{ contains: "EMPLOYER LTD", category: "Work", subcategory: "Salary" }];
    const month = january([hsbc("2026-01-20", "In", 250000, "CR EMPLOYER LTD"), hsbc("2026-01-22", "Out", 1999, "EMPLOYER LTD OVERPAYMENT")], [food, work], rules);
    expect(month.earnings).toEqual({
      total: 248001,
      uncategorised: 0,
      categories: [{ name: "Work", total: 248001, subcategories: [{ name: "Salary", pence: 248001 }, { name: "Bonus", pence: 0 }] }],
    });
    expect(month.spending.total).toBe(0);
    expect(month.net).toBe(248001);
  });

  it("counts Transfers as neither Spending nor Earnings, whichever way the money moves", () => {
    const rules: CategorisationRule[] = [{ contains: "card bill", transfer: true }];
    const month = january([hsbc("2026-01-10", "Out", 80000, "CARD BILL PAYMENT"), { ...hsbc("2026-01-12", "In", 80000, "CARD BILL THANK YOU"), account: "Card" }], [food, work], rules);
    expect([month.spending.total, month.earnings.total, month.net]).toEqual([0, 0, 0]);
  });

  it("keeps money out that no rule matches in Uncategorised Spending, and money in in Uncategorised Earnings, beside the Categories", () => {
    const rules: CategorisationRule[] = [{ contains: "CORNER SHOP", category: "Food", subcategory: "Groceries" }];
    const transactions = [
      hsbc("2026-01-03", "Out", 1001, "CORNER SHOP"),
      hsbc("2026-01-04", "Out", 2002, "MYSTERY MERCHANT"),
      hsbc("2026-01-05", "In", 303, "MYSTERY MERCHANT"),
    ];
    const month = january(transactions, [food, work], rules);
    expect([month.spending.uncategorised, month.spending.total]).toEqual([2002, 3003]);
    expect([month.earnings.uncategorised, month.earnings.total]).toEqual([303, 303]);
    expect(month.net).toBe(-2700);
  });
});
