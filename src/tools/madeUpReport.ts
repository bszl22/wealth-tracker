import type { Balance } from "../netWorth.js";
import type { Category, CategorisationRule } from "../rules.js";
import { buildReport } from "../report.js";
import { startServer } from "../server.js";
import type { Transaction } from "../spending.js";
import type { AccountKind, Direction, IsoDate, Pence } from "../statements.js";

// Serves the page with a made-up report, for checking the page without the real Statements. Every Account,
// description and figure is invented. Today is fixed at 12 July 2026, so January to June are full months and
// July is the current month. It covers Refunds, Transfers, Uncategorised money in and out, a one-off large
// purchase in May, an investment fall in April, and a Stale Account.

const PORT = 4400;
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
  { contains: "SKY AIRLINES", category: "Fun", subcategory: "Holidays" },
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
add(CURRENT, day(7, 1), "DD LANDLORD RENT", 125000, "Out");
add(CARD, day(7, 4), "SUPERMARKET 0412", 6100, "Out");
add(CARD, day(7, 8), "CORNER CAFE", 2700, "Out");

/** A Running Balance after each Transaction, from the opening Balance at the end of 2025. */
function runningBalances(account: MadeUpAccount): Balance[] {
  const statement = "Made-up Statements/opening.pdf";
  const opening: Balance = { statement, account: account.name, kind: account.kind, date: "2025-12-31", pence: account.opening, source: "Closing" };
  let pence = account.opening;
  const adds: Direction = account.kind === "Asset" ? "In" : "Out";
  const running = transactions
    .filter((t) => t.account === account.name)
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

const report = buildReport({
  balances,
  transactions,
  categories,
  rules,
  rulesFile: { path: "Made-up Statements/rules.json", found: true },
  trackingStart: { year: 2026, month: 1 },
  today: TODAY,
});

try {
  await startServer(async () => report, PORT);
  console.log(`Wealth Tracker, with a made-up report, is running at http://127.0.0.1:${PORT}/`);
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
}
