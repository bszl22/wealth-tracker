import { describe, expect, it } from "vitest";
import type { Category, CategorisationRule } from "./rules.js";
import { calculateSpending, type Breakdown, type CategoryTotal, type SpendingInput, type Transaction } from "./spending.js";

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

/** A Category's figures alone, without the Transactions behind them. */
const categoryFigures = ({ name, total, subcategories }: CategoryTotal) => ({
  name,
  total,
  subcategories: subcategories.map(({ name, pence }) => ({ name, pence })),
});

/** A Breakdown's figures alone, without the Transactions behind them. */
const figures = ({ total, uncategorised, categories }: Breakdown) => ({ total, uncategorised, categories: categories.map(categoryFigures) });

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
    expect(figures(month.spending)).toEqual({
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
    expect(categoryFigures(month.spending.categories[0]!)).toEqual({
      name: "Food",
      total: 750,
      subcategories: [{ name: "Groceries", pence: 0 }, { name: "Eating Out", pence: 750 }],
    });
    expect(month.earnings.total).toBe(0);
  });

  it("counts money in under an Earnings Category as Earnings, and money out under it as reducing Earnings", () => {
    const rules: CategorisationRule[] = [{ contains: "EMPLOYER LTD", category: "Work", subcategory: "Salary" }];
    const month = january([hsbc("2026-01-20", "In", 250000, "CR EMPLOYER LTD"), hsbc("2026-01-22", "Out", 1999, "EMPLOYER LTD OVERPAYMENT")], [food, work], rules);
    expect(figures(month.earnings)).toEqual({
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
  it("gives the Transactions behind each Category, Subcategory and Uncategorised figure in each month", () => {
    const rules: CategorisationRule[] = [
      { contains: "CORNER SHOP", category: "Food", subcategory: "Groceries" },
      { contains: "CORNER CAFE", category: "Food", subcategory: "Eating Out" },
      { contains: "EMPLOYER LTD", category: "Work", subcategory: "Salary" },
      { contains: "CARD BILL", transfer: true },
    ];
    const shop = hsbc("2026-01-03", "Out", 1050, "CORNER SHOP");
    const cafe = hsbc("2026-01-04", "Out", 1200, "CORNER CAFE");
    const cafeRefund = hsbc("2026-01-05", "In", 450, "CORNER CAFE");
    const salary = hsbc("2026-01-20", "In", 250000, "CR EMPLOYER LTD");
    const bill = hsbc("2026-01-21", "Out", 80000, "CARD BILL PAYMENT");
    const mysteryOut = hsbc("2026-01-22", "Out", 2002, "MYSTERY MERCHANT");
    const mysteryIn = hsbc("2026-01-23", "In", 303, "MYSTERY MERCHANT");
    const february = hsbc("2026-02-02", "Out", 999, "CORNER SHOP");
    const { months } = calculateSpending({
      transactions: [shop, cafe, cafeRefund, salary, bill, mysteryOut, mysteryIn, february],
      categories: [food, work],
      rules,
      trackingStart: january2026,
      today: "2026-02-10",
    });
    const [january, februaryMonth] = months;
    const foodTotal = january!.spending.categories[0]!;
    expect(foodTotal.transactions).toEqual([shop, cafe, cafeRefund]);
    expect(foodTotal.subcategories.map((s) => s.transactions)).toEqual([[shop], [cafe, cafeRefund]]);
    expect(january!.spending.uncategorisedTransactions).toEqual([mysteryOut]);
    expect(january!.earnings.categories[0]!.transactions).toEqual([salary]);
    expect(january!.earnings.uncategorisedTransactions).toEqual([mysteryIn]);
    expect(februaryMonth!.spending.categories[0]!.subcategories[0]!.transactions).toEqual([february]);
  });
  it("ranks the Uncategorised descriptions by their total from Tracking Start through today, largest first, money out apart from money in", () => {
    const rules: CategorisationRule[] = [
      { contains: "CORNER SHOP", category: "Food", subcategory: "Groceries" },
      { contains: "CARD BILL", transfer: true },
    ];
    const bakeryJanuary = hsbc("2026-01-04", "Out", 350, "VIS BAKERY");
    const bakeryFebruary = hsbc("2026-02-04", "Out", 1700, "VIS BAKERY");
    const garage = hsbc("2026-01-09", "Out", 2001, "GARAGE SERVICES");
    const mysteryIn = hsbc("2026-02-05", "In", 300, "VIS BAKERY");
    const transactions = [
      hsbc("2025-12-30", "Out", 999999, "VIS BAKERY"),
      bakeryJanuary,
      garage,
      hsbc("2026-01-10", "Out", 50000, "CORNER SHOP"),
      hsbc("2026-01-11", "Out", 80000, "CARD BILL PAYMENT"),
      bakeryFebruary,
      mysteryIn,
      hsbc("2026-03-01", "Out", 999999, "VIS BAKERY"),
    ];
    const { uncategorised } = calculateSpending({ transactions, categories: [food], rules, trackingStart: january2026, today: "2026-02-28" });
    expect(uncategorised).toEqual([
      { description: "VIS BAKERY", direction: "Out", pence: 2050, transactions: [bakeryJanuary, bakeryFebruary] },
      { description: "GARAGE SERVICES", direction: "Out", pence: 2001, transactions: [garage] },
      { description: "VIS BAKERY", direction: "In", pence: 300, transactions: [mysteryIn] },
    ]);
  });
});
