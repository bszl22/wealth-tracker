import { describe, expect, it } from "vitest";
import type { Category, CategorisationRule } from "./rules.js";
import type { Transaction } from "./spending.js";
import { findSubscriptions, type Subscription } from "./subscriptions.js";

// Made-up Transactions. Every description and figure is invented.
const hsbc = (date: string, pence: number, description: string, direction: Transaction["direction"] = "Out"): Transaction => ({
  statement: "HSBC Statements/2026.pdf",
  account: "HSBC",
  date,
  description,
  pence,
  direction,
});

/** Charges of `pence` for `description` on each date. */
const charges = (description: string, pence: number, dates: string[]) => dates.map((date) => hsbc(date, pence, description));

const fun: Category = { name: "Fun", kind: "Spending", subcategories: ["Streaming", "Gym"] };
const work: Category = { name: "Work", kind: "Earnings", subcategories: ["Salary"] };
const categories = [fun, work];
const rules: CategorisationRule[] = [
  { contains: "STREAMFLIX", category: "Fun", subcategory: "Streaming" },
  { contains: "TRAVEL COVER", category: "Fun", subcategory: "Gym", subscription: "Yearly" },
  { contains: "FITNESS HUB", category: "Fun", subcategory: "Gym", subscription: "Monthly" },
  { contains: "EMPLOYER", category: "Work", subcategory: "Salary" },
  { contains: "SAVINGS POT", transfer: true },
];

const find = (transactions: Transaction[], today = "2026-07-12") => findSubscriptions({ transactions, categories, rules, today });

/** A Subscription's figures alone, without the Transactions behind it. */
const figures = ({ transactions, ...rest }: Subscription) => ({ ...rest, charges: transactions.length });

describe("findSubscriptions", () => {
  it("finds a monthly Subscription matched by a rule, named by the rule's Subcategory and \"contains\" text", () => {
    const { subscriptions } = find(charges("STREAMFLIX.COM", 1099, ["2026-03-15", "2026-04-15", "2026-05-15", "2026-06-15"]));
    expect(subscriptions.map(figures)).toEqual([
      { name: "Streaming (STREAMFLIX)", usual: 1099, interval: "Monthly", lastCharge: "2026-06-15", current: true, yearlyCost: 13188, declared: false, charges: 4 },
    ]);
  });

  it("finds a Subscription declared on its rule from one charge, with the stated interval and yearly cost, counted in the total", () => {
    const { subscriptions, currentYearlyCost } = find(charges("TRAVEL COVER ANNUAL", 8900, ["2026-03-03"]));
    expect(subscriptions.map(figures)).toEqual([
      { name: "Gym (TRAVEL COVER)", usual: 8900, interval: "Yearly", lastCharge: "2026-03-03", current: true, yearlyCost: 8900, declared: true, charges: 1 },
    ]);
    expect(currentYearlyCost).toBe(8900);
  });

  it("gives a declared Subscription the interval its rule states, whatever its charges' gaps suggest", () => {
    const { subscriptions } = find(charges("TRAVEL COVER", 8900, ["2026-04-01", "2026-05-01", "2026-06-01"]));
    expect(subscriptions.map(({ interval, yearlyCost }) => ({ interval, yearlyCost }))).toEqual([{ interval: "Yearly", yearlyCost: 8900 }]);
  });

  it("lists a declared Subscription whose charges vary by more than 10%, with the middle charge as its usual amount", () => {
    const { subscriptions } = find([...charges("FITNESS HUB", 3000, ["2026-04-01"]), ...charges("FITNESS HUB", 4500, ["2026-05-01", "2026-06-01"])]);
    expect(subscriptions.map(({ usual, yearlyCost, declared }) => ({ usual, yearlyCost, declared }))).toEqual([{ usual: 4500, yearlyCost: 54000, declared: true }]);
  });

  it("finds weekly and yearly Subscriptions, with no rule named by their description", () => {
    const { subscriptions } = find([
      ...charges("VEG BOX DELIVERY", 1850, ["2026-06-22", "2026-06-29", "2026-07-06"]),
      ...charges("PHOTO CLOUD ANNUAL", 5999, ["2025-07-08", "2026-07-08"]),
    ]);
    expect(subscriptions.map(({ name, interval, yearlyCost }) => ({ name, interval, yearlyCost }))).toEqual([
      { name: "VEG BOX DELIVERY", interval: "Weekly", yearlyCost: 96200 },
      { name: "PHOTO CLOUD ANNUAL", interval: "Yearly", yearlyCost: 5999 },
    ]);
  });

  it("is not a Subscription with fewer than 3 charges, or 2 for yearly", () => {
    const { subscriptions } = find([
      ...charges("VEG BOX DELIVERY", 1850, ["2026-06-29", "2026-07-06"]),
      ...charges("STREAMFLIX.COM", 1099, ["2026-05-15", "2026-06-15"]),
      ...charges("PHOTO CLOUD ANNUAL", 5999, ["2026-07-08"]),
    ]);
    expect(subscriptions).toEqual([]);
  });

  it("is not a Subscription when the charges fall at no regular interval", () => {
    const { subscriptions } = find(charges("STREAMFLIX.COM", 1099, ["2026-03-15", "2026-04-15", "2026-06-15"]));
    expect(subscriptions).toEqual([]);
  });

  it("allows each charge within 10% of the usual amount, and is not a Subscription when one is further", () => {
    const within = find(charges("STREAMFLIX.COM", 1000, ["2026-03-15", "2026-04-15"]).concat(charges("STREAMFLIX.COM", 1100, ["2026-05-15"])));
    expect(within.subscriptions.map(({ usual }) => usual)).toEqual([1000]);
    const further = find(charges("STREAMFLIX.COM", 1000, ["2026-03-15", "2026-04-15"]).concat(charges("STREAMFLIX.COM", 1101, ["2026-05-15"])));
    expect(further.subscriptions).toEqual([]);
  });

  it("groups Transactions matched by one rule across varying descriptions, and with no rule by description", () => {
    const { subscriptions } = find([
      hsbc("2026-04-15", 1099, "STREAMFLIX.COM"),
      hsbc("2026-05-15", 1099, "STREAMFLIX*MAY"),
      hsbc("2026-06-15", 1099, "VIS STREAMFLIX LONDON"),
      ...charges("GYM CLUB 0412", 3500, ["2026-04-01", "2026-05-01"]),
      ...charges("GYM CLUB 0977", 3500, ["2026-06-01"]),
    ]);
    expect(subscriptions.map(figures).map(({ name, charges }) => ({ name, charges }))).toEqual([{ name: "Streaming (STREAMFLIX)", charges: 3 }]);
  });

  it("never finds a Transfer or Earnings, nor money in", () => {
    const monthly = ["2026-04-25", "2026-05-25", "2026-06-25"];
    const { subscriptions } = find([
      ...charges("TO SAVINGS POT", 40000, monthly),
      ...charges("ACME EMPLOYER REFUND", 5000, monthly),
      ...monthly.map((date) => hsbc(date, 310000, "CR ACME EMPLOYER", "In")),
      ...monthly.map((date) => hsbc(date, 2000, "PAYMENT FROM A FRIEND", "In")),
    ]);
    expect(subscriptions).toEqual([]);
  });

  it("is current while its next charge falls after its Account's latest Transaction, however far behind today", () => {
    const monthly = charges("STREAMFLIX.COM", 1099, ["2026-04-15", "2026-05-15", "2026-06-15"]);
    expect(find(monthly, "2027-03-01").subscriptions[0]!.current).toBe(true);
  });

  it("is lapsed once its next charge plus 7 days falls on or before its Account's latest Transaction with no charge", () => {
    const coveredTo = (date: string) => hsbc(date, 450, "CORNER SHOP");
    const monthly = charges("STREAMFLIX.COM", 1099, ["2026-04-15", "2026-05-15", "2026-06-15"]);
    expect(find([...monthly, coveredTo("2026-07-21")]).subscriptions[0]!.current).toBe(true);
    expect(find([...monthly, coveredTo("2026-07-22")]).subscriptions[0]!.current).toBe(false);
    const weekly = charges("VEG BOX DELIVERY", 1850, ["2026-06-22", "2026-06-29", "2026-07-06"]);
    expect(find([...weekly, coveredTo("2026-07-19")]).subscriptions[0]!.current).toBe(true);
    expect(find([...weekly, coveredTo("2026-07-20")]).subscriptions[0]!.current).toBe(false);
    const yearly = charges("PHOTO CLOUD ANNUAL", 5999, ["2024-07-08", "2025-07-08"]);
    expect(find([...yearly, coveredTo("2026-07-14")]).subscriptions[0]!.current).toBe(true);
    expect(find([...yearly, coveredTo("2026-07-15")]).subscriptions[0]!.current).toBe(false);
  });

  it("judges each Subscription against its own Account's latest Transaction", () => {
    const monzo = (transaction: Transaction): Transaction => ({ ...transaction, statement: "Monzo Statements/2026.pdf", account: "Monzo" });
    const { subscriptions } = find([
      ...charges("STREAMFLIX.COM", 1099, ["2026-04-15", "2026-05-15", "2026-06-15"]),
      hsbc("2026-09-30", 450, "CORNER SHOP"),
      ...charges("MUSICBOX", 999, ["2026-04-20", "2026-05-20", "2026-06-20"]).map(monzo),
      monzo(hsbc("2026-06-30", 450, "CORNER SHOP")),
    ]);
    expect(subscriptions.map(({ name, current }) => [name, current])).toEqual([
      ["MUSICBOX", true],
      ["Streaming (STREAMFLIX)", false],
    ]);
  });

  it("counts in the total yearly cost only those current by their Account's latest Transaction", () => {
    const { currentYearlyCost } = find(
      [
        ...charges("STREAMFLIX.COM", 1099, ["2026-04-15", "2026-05-15", "2026-06-15"]),
        ...charges("MUSICBOX", 999, ["2026-01-20", "2026-02-20", "2026-03-20"]),
      ],
      "2027-03-01",
    );
    expect(currentYearlyCost).toBe(13188);
  });

  it("gives a yearly cost of the usual amount × 52, 12 or 1, to the penny", () => {
    const { subscriptions } = find([
      ...charges("VEG BOX DELIVERY", 1999, ["2026-06-22", "2026-06-29", "2026-07-06"]),
      ...charges("STREAMFLIX.COM", 1099, ["2026-04-15", "2026-05-15", "2026-06-15"]),
      ...charges("PHOTO CLOUD ANNUAL", 5999, ["2025-07-08", "2026-07-08"]),
    ]);
    expect(subscriptions.map(({ yearlyCost }) => yearlyCost)).toEqual([103948, 13188, 5999]);
  });

  it("lists current Subscriptions then lapsed, each largest yearly cost first, with the total yearly cost of current ones", () => {
    const { subscriptions, currentYearlyCost } = find([
      ...charges("STREAMFLIX.COM", 1099, ["2026-04-15", "2026-05-15", "2026-06-15"]),
      ...charges("GYM CLUB", 3500, ["2026-01-01", "2026-02-01", "2026-03-01"]),
      ...charges("MUSICBOX", 999, ["2026-01-20", "2026-02-20", "2026-03-20"]),
      ...charges("PHOTO CLOUD ANNUAL", 5999, ["2025-07-08", "2026-07-08"]),
      ...charges("DD LANDLORD RENT", 125000, ["2026-05-01", "2026-06-01", "2026-07-01"]),
    ]);
    expect(subscriptions.map(({ name, current }) => [name, current])).toEqual([
      ["DD LANDLORD RENT", true],
      ["Streaming (STREAMFLIX)", true],
      ["PHOTO CLOUD ANNUAL", true],
      ["GYM CLUB", false],
      ["MUSICBOX", false],
    ]);
    expect(currentYearlyCost).toBe(1500000 + 13188 + 5999);
  });
});
