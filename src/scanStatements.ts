import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import type { Balance } from "./netWorth.js";
import { extractPdfText } from "./pdfText.js";
import { readAmexStatement } from "./readers/amex.js";
import { readHsbcStatement } from "./readers/hsbc.js";
import { readKrooStatement } from "./readers/kroo.js";
import { readVanguardStatement } from "./readers/vanguard.js";
import type { Transaction } from "./spending.js";
import { singleSpaced, StatementReadError, type StatementAccount } from "./statements.js";

type StatementReader = (text: string) => StatementAccount[];

/**
 * Each Institution folder the tracker can read. Folders not listed here are ignored. HSBC reads its table's
 * columns from the extracted layout; the other readers get the text single spaced.
 */
const READERS: Record<string, StatementReader> = {
  "Amex Statements": (text) => readAmexStatement(singleSpaced(text)),
  "HSBC Statements": readHsbcStatement,
  Kroo: (text) => readKrooStatement(singleSpaced(text)),
  "Vanguard Statements": (text) => readVanguardStatement(singleSpaced(text)),
};

/** One file in a known Institution folder and the Accounts its reader found, or why it could not be read. */
export type StatementRead = { file: string } & ({ accounts: StatementAccount[] } | { error: string });

/**
 * Reads every file in the known Institution folders, one result per file, skipping hidden files such as
 * .DS_Store. Fails when a known folder is missing, since its Accounts would silently drop out of Net Worth,
 * and reports a subfolder as unreadable rather than reading the Statements filed inside it.
 * Never writes to the data folder.
 */
export async function readStatements(dataFolder: string): Promise<StatementRead[]> {
  const folders = await readdir(dataFolder).catch(() => {
    throw new Error(`The data folder does not exist or can't be opened: ${dataFolder}`);
  });
  const reads: StatementRead[] = [];
  for (const [folder, read] of Object.entries(READERS)) {
    if (!folders.includes(folder)) throw new Error(`The data folder has no "${folder}" folder. Add it, even if empty.`);
    const names = await readdir(join(dataFolder, folder)).catch(() => {
      throw new Error(`The "${folder}" folder in the data folder can't be opened`);
    });
    const files = names.filter((name) => !name.startsWith(".")).sort();
    for (const file of files) {
      reads.push({ file: `${folder}/${file}`, ...(await readStatement(join(dataFolder, folder, file), read)) });
    }
  }
  return reads;
}

/** The Accounts one file's reader found, or why it could not be read. Only a reader's own messages pass through, since they never quote the Statement. */
async function readStatement(path: string, read: StatementReader): Promise<{ accounts: StatementAccount[] } | { error: string }> {
  if ((await stat(path)).isDirectory()) return { error: "Subfolders are not read, so move its Statements up into this folder" };
  if (!path.toLowerCase().endsWith(".pdf")) return { error: "Only PDF Statements can be read, so move it out of this folder" };
  let text: string;
  try {
    text = await extractPdfText(path);
  } catch {
    return { error: "Not a readable PDF" };
  }
  try {
    return { accounts: read(text) };
  } catch (error) {
    return { error: error instanceof StatementReadError ? error.message : "Does not match its Institution's Statement layout" };
  }
}

/** Every Balance and Transaction from every Statement, reconciled where Statements overlap, failing with every file that could not be read. */
export async function scanStatements(dataFolder: string): Promise<{ balances: Balance[]; transactions: Transaction[] }> {
  return reconcileStatements(await readStatements(dataFolder));
}

/**
 * Every Balance and Transaction from the files read, each tagged with its Account and Statement file, failing with every
 * file that could not be read. It gives one Balance per Account and date, failing when overlapping Statements disagree,
 * and counts each Transaction once where Statements overlap.
 */
export function reconcileStatements(statements: StatementRead[]): { balances: Balance[]; transactions: Transaction[] } {
  const unreadable = statements.flatMap((s) => ("error" in s ? [`Could not read ${s.file}: ${s.error}`] : []));
  if (unreadable.length > 0) throw new Error(unreadable.join("\n"));
  const balances: Balance[] = [];
  const transactions: Transaction[] = [];
  for (const statement of statements) {
    if ("error" in statement) continue;
    for (const { name, kind, balances: accountBalances, transactions: accountTransactions } of statement.accounts) {
      for (const balance of accountBalances) balances.push({ ...balance, statement: statement.file, account: name, kind });
      for (const transaction of accountTransactions) transactions.push({ ...transaction, statement: statement.file, account: name });
    }
  }
  return { balances: agreedBalances(balances), transactions: withoutOverlaps(transactions) };
}

/**
 * One Balance per Account and date, failing when two Statements give different Balances for the same Account and date.
 * Within one Statement, several Running Balances can share a date, so each Statement's last listed one counts.
 */
function agreedBalances(balances: Balance[]): Balance[] {
  const perStatement = new Map<string, Balance>();
  for (const balance of balances) perStatement.set(`${balance.statement}\n${balance.account}\n${balance.date}`, balance);
  const firstListed = new Map<string, Balance>();
  for (const balance of perStatement.values()) {
    const key = `${balance.account}\n${balance.date}`;
    const earlier = firstListed.get(key);
    if (!earlier) firstListed.set(key, balance);
    else if (earlier.pence !== balance.pence) {
      throw new Error(
        `${earlier.statement} and ${balance.statement} give different Balances for ${balance.account} on ${balance.date}`,
      );
    }
  }
  return [...firstListed.values()];
}

/**
 * Overlapping Statements list some Transactions twice, while one Statement can list two identical Transactions,
 * such as two coffees at the same price on the same day. So a Transaction, identified by its Account, date,
 * description, amount and direction, counts as many times as the one Statement listing it most.
 */
function withoutOverlaps(transactions: Transaction[]): Transaction[] {
  const byIdentity = new Map<string, Map<string, Transaction[]>>();
  for (const t of transactions) {
    const identity = [t.account, t.date, t.description, t.pence, t.direction].join("\n");
    const byStatement = byIdentity.get(identity) ?? new Map<string, Transaction[]>();
    byStatement.set(t.statement, [...(byStatement.get(t.statement) ?? []), t]);
    byIdentity.set(identity, byStatement);
  }
  return [...byIdentity.values()].flatMap((byStatement) =>
    [...byStatement.values()].reduce((most, listed) => (listed.length > most.length ? listed : most)),
  );
}
