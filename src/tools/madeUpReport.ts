import type { Balance } from "../netWorth.js";
import type { Category, CategorisationRule } from "../rules.js";
import { rulesFileHolding } from "../rulesFile.js";
import type { StatementRead } from "../scanStatements.js";
import type { Transaction } from "../spending.js";
import type { AccountKind, Direction, IsoDate, Pence, StatementAccount } from "../statements.js";
import type { AskClaude } from "../suggestions.js";
import { createTracker, type Tracker } from "../tracker.js";

// A made-up tracker, for checking the page without the real Statements: served by serveMadeUpReport.ts and
// rendered by page.test.ts. Every Account, description and figure is invented. Today is fixed at 12 July 2026, so January to June are full months and
// July is the current month. It covers Refunds, Transfers, Uncategorised money in and out, Uncategorised
// descriptions whose digits mask to the same text, a one-off large purchase in May, an investment fall in April, a
// Stale Account, current and lapsed weekly, monthly and yearly Subscriptions, and a yearly Subscription declared on its
// rule with a single charge.

const TODAY: IsoDate = "2026-07-12";
const FULL_MONTHS = [1, 2, 3, 4, 5, 6];

const categories: Category[] = [
  { name: "Home", kind: "Spending", subcategories: ["Rent", "Energy"] },
  { name: "Food", kind: "Spending", subcategories: ["Groceries", "Eating Out"] },
  { name: "Fun", kind: "Spending", subcategories: ["Streaming", "Holidays"] },
  { name: "Work", kind: "Earnings", subcategories: ["Salary"] },
  { name: "Savings", kind: "Earnings", subcategories: ["Interest"] },
];

const rules: CategorisationRule[] = [
  { contains: "LANDLORD", category: "Home", subcategory: "Rent" },
  { contains: "POWER CO", category: "Home", subcategory: "Energy" },
  { contains: "SUPERMARKET", category: "Food", subcategory: "Groceries" },
  { contains: "CORNER CAFE", category: "Food", subcategory: "Eating Out" },
  { contains: "STREAMFLIX", category: "Fun", subcategory: "Streaming" },
  { contains: "MUSICBOX", category: "Fun", subcategory: "Streaming" },
  { contains: "PHOTO CLOUD", category: "Fun", subcategory: "Streaming" },
  { contains: "VEG BOX", category: "Food", subcategory: "Groceries" },
  { contains: "SKY AIRLINES", category: "Fun", subcategory: "Holidays" },
  { contains: "TRAVEL COVER", category: "Fun", subcategory: "Holidays", subscription: "Yearly" },
  { contains: "EMPLOYER", category: "Work", subcategory: "Salary" },
  { contains: "INTEREST", category: "Savings", subcategory: "Interest" },
  { contains: "THANK YOU", transfer: true },
  { contains: "POT", transfer: true },
];

type MadeUpAccount = { name: string; kind: AccountKind; opening: Pence };
const CURRENT: MadeUpAccount = { name: "Current Account", kind: "Asset", opening: 450000 };
const SAVINGS: MadeUpAccount = { name: "Savings Pot", kind: "Asset", opening: 800000 };
const CARD: MadeUpAccount = { name: "Credit Card", kind: "Liability", opening: 0 };

const day = (month: number, d: number): IsoDate => `2026-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

const transactions: (Transaction & { kind: AccountKind })[] = [];
function add(account: MadeUpAccount, date: IsoDate, description: string, pence: Pence, direction: Direction) {
  const statement = `Made-up Statements/${account.name} ${date.slice(0, 7)}.pdf`;
  transactions.push({ statement, account: account.name, kind: account.kind, date, description, pence, direction });
}

for (const month of FULL_MONTHS) {
  add(CURRENT, day(month, 1), "DD LANDLORD RENT", 125000, "Out");
  add(CURRENT, day(month, 3), "DD POWER CO", month <= 3 ? 14500 - month * 1000 : 8000, "Out");
  add(CURRENT, day(month, 2), "TO SAVINGS POT", 40000, "Out");
  add(SAVINGS, day(month, 2), "FROM CURRENT ACCOUNT POT", 40000, "In");
  add(SAVINGS, day(month, 28), "INTEREST PAID", 2500 + month * 120, "In");
  add(CURRENT, day(month, 25), "CR ACME EMPLOYER LTD", 310000, "In");
  for (const week of [4, 11, 18, 24]) add(CARD, day(month, week), "SUPERMARKET 0412", 5200 + ((month * 7 + week) % 9) * 450, "Out");
  for (const d of month === 4 ? [6, 9, 13, 17, 21, 27] : [8, 22]) add(CARD, day(month, d), "CORNER CAFE", 2400 + (d % 5) * 300, "Out");
  add(CARD, day(month, 15), "STREAMFLIX.COM", 1099, "Out");
}
// Subscriptions: a weekly veg box and a monthly music service, both lapsed, and a yearly photo service, current.
for (let d = 5; d <= 54; d += 7) add(CARD, d <= 31 ? day(1, d) : day(2, d - 31), "VEG BOX DELIVERY", 1850, "Out");
for (const month of [1, 2, 3]) add(CURRENT, day(month, 20), "MUSICBOX SUBSCRIPTION", 999, "Out");
add(CARD, "2025-07-08", "PHOTO CLOUD ANNUAL", 5999, "Out");
add(CARD, day(7, 8), "PHOTO CLOUD ANNUAL", 5999, "Out");
// A yearly travel cover, declared on its rule, so it is a Subscription from its one charge.
add(CURRENT, day(3, 3), "TRAVEL COVER ANNUAL", 8900, "Out");
// The card bill for each month is paid from the current account early the next month.
for (const month of FULL_MONTHS) {
  const owed = transactions
    .filter((t) => t.account === CARD.name && t.date.slice(5, 7) === String(month).padStart(2, "0"))
    .reduce((total, t) => total + (t.direction === "Out" ? t.pence : -t.pence), 0);
  add(CURRENT, day(month + 1, 6), "CARD PAYMENT THANK YOU", owed, "Out");
  add(CARD, day(month + 1, 6), "PAYMENT RECEIVED - THANK YOU", owed, "In");
}
add(CARD, day(3, 19), "CORNER CAFE", 1500, "In");
add(CARD, day(5, 10), "SKY AIRLINES", 148000, "Out");
add(CURRENT, day(2, 14), "MYSTERY MERCHANT LTD", 6700, "Out");
add(CURRENT, day(5, 20), "MYSTERY MERCHANT LTD", 12900, "Out");
add(CURRENT, day(3, 9), "PAYMENT FROM A FRIEND", 4500, "In");
add(CURRENT, day(4, 12), "CITY PARKING 20417", 450, "Out");
add(CURRENT, day(4, 26), "CITY PARKING 20988", 450, "Out");
add(CURRENT, day(7, 1), "DD LANDLORD RENT", 125000, "Out");
add(CARD, day(7, 4), "SUPERMARKET 0412", 6100, "Out");
add(CARD, day(7, 8), "CORNER CAFE", 2700, "Out");

/** A Running Balance after each Transaction, from the opening Balance at the end of 2025, which already holds any earlier one. */
function runningBalances(account: MadeUpAccount): Balance[] {
  const statement = "Made-up Statements/opening.pdf";
  const opening: Balance = { statement, account: account.name, kind: account.kind, date: "2025-12-31", pence: account.opening, source: "Closing" };
  let pence = account.opening;
  const adds: Direction = account.kind === "Asset" ? "In" : "Out";
  const running = transactions
    .filter((t) => t.account === account.name && t.date > opening.date)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(({ statement, date, pence: moved, direction }): Balance => {
      pence += direction === adds ? moved : -moved;
      return { statement, account: account.name, kind: account.kind, date, pence, source: "Running" };
    });
  return [opening, ...running];
}

const closing = (account: string, date: IsoDate, pence: Pence): Balance => ({
  statement: `Made-up Statements/${account} ${date}.pdf`,
  account,
  kind: "Asset",
  date,
  pence,
  source: "Closing",
});

const balances: Balance[] = [
  ...[CURRENT, SAVINGS, CARD].flatMap(runningBalances),
  // Valued only on Statement dates, and falling in April.
  closing("Investment ISA", "2026-01-31", 2150000),
  closing("Investment ISA", "2026-03-31", 2240000),
  closing("Investment ISA", "2026-04-30", 2010000),
  closing("Investment ISA", "2026-06-30", 2095000),
  // Stale: no Statement since March.
  closing("Old Easy Access", "2026-01-31", 120000),
  closing("Old Easy Access", "2026-03-31", 120000),
];

/** The made-up Statement files, each with its Accounts as a reader would give them. */
function madeUpReads(): StatementRead[] {
  const files = new Map<string, Map<string, StatementAccount>>();
  const accountIn = (file: string, name: string, kind: AccountKind): StatementAccount => {
    const accounts = files.get(file) ?? new Map<string, StatementAccount>();
    files.set(file, accounts);
    const account = accounts.get(name) ?? { name, kind, balances: [], transactions: [] };
    accounts.set(name, account);
    return account;
  };
  for (const { statement, account, kind, ...balance } of balances) accountIn(statement, account, kind).balances.push(balance);
  for (const { statement, account, kind, ...transaction } of transactions) accountIn(statement, account, kind).transactions.push(transaction);
  return [...files].map(([file, accounts]) => ({ file, accounts: [...accounts.values()] }));
}

/**
 * Made-up responses from Claude, one per suggestion, given only for a sent description containing its "contains" text:
 * one using an existing Subcategory, one marking a Transfer, one naming a new Category, and one with masked text, which
 * matches no real description, so only the first three are offered.
 */
const MADE_UP_SUGGESTIONS = [
  { contains: "MYSTERY MERCHANT", transfer: false, category: "Fun", subcategory: "Holidays" },
  { contains: "FRIEND", transfer: true, category: "", subcategory: "" },
  { contains: "CITY PARKING", transfer: false, category: "Transport", subcategory: "Parking" },
  { contains: "PARKING ####", transfer: false, category: "Fun", subcategory: "Holidays" },
];

export const madeUpClaude: AskClaude = async ({ descriptions }) =>
  JSON.stringify({
    suggestions: MADE_UP_SUGGESTIONS.filter(({ contains }) => descriptions.some(({ description }) => description.toLowerCase().includes(contains.toLowerCase()))),
  });

/**
 * The tracker with the made-up Statements, saving rules into a made-up rules file held in memory, so the data folder is
 * never touched. The rules file starts with the made-up Categories and rules unless told there is none yet, and saving
 * a rule then creates it. It says an API key is set unless told otherwise, though none is ever read or used: Suggested
 * Rules come from `madeUpClaude`, or the `claude` given, and never from the API. Told no key is set, it has no Claude to
 * ask, so asking for Suggested Rules fails as it does in the tracker.
 */
export function madeUpTracker({ apiKeySet = true, rulesFile = true, claude = madeUpClaude }: { apiKeySet?: boolean; rulesFile?: boolean; claude?: AskClaude } = {}): Tracker {
  return createTracker({
    readStatements: async () => madeUpReads(),
    rulesFile: rulesFileHolding(rulesFile ? JSON.stringify({ categories, rules }, null, 2) + "\n" : undefined, "Made-up Statements/rules.json"),
    claude: apiKeySet ? claude : undefined,
    trackingStart: { year: 2026, month: 1 },
    today: () => TODAY,
  });
}
