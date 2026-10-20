import { readdir } from "node:fs/promises";
import { join } from "node:path";
import type { Balance } from "./netWorth.js";
import { extractPdfText } from "./pdfText.js";
import { readAmexStatement } from "./readers/amex.js";
import { readHsbcStatement } from "./readers/hsbc.js";
import { readKrooStatement } from "./readers/kroo.js";
import { readVanguardStatement } from "./readers/vanguard.js";
import { StatementReadError, type StatementAccount } from "./statements.js";

type StatementReader = (text: string) => StatementAccount[];

/** Each Institution folder the tracker can read. Folders not listed here are ignored. */
const READERS: Record<string, StatementReader> = {
  "Amex Statements": readAmexStatement,
  "HSBC Statements": readHsbcStatement,
  Kroo: readKrooStatement,
  "Vanguard Statements": readVanguardStatement,
};

/** One file in a known Institution folder and the Accounts its reader found, or why it could not be read. */
export type StatementRead = { file: string } & ({ accounts: StatementAccount[] } | { error: string });

/**
 * Reads every file in the known Institution folders, one result per file, skipping hidden files such as
 * .DS_Store. Fails when a known folder is missing, since its Accounts would silently drop out of Net Worth.
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

/** Every Balance from every Statement, failing with every file that could not be read. */
export async function scanStatements(dataFolder: string): Promise<Balance[]> {
  const statements = await readStatements(dataFolder);
  const unreadable = statements.flatMap((s) => ("error" in s ? [`Could not read ${s.file}: ${s.error}`] : []));
  if (unreadable.length > 0) throw new Error(unreadable.join("\n"));
  const balances: Balance[] = [];
  for (const statement of statements) {
    if ("error" in statement) continue;
    for (const { name, kind, balances: accountBalances } of statement.accounts) {
      for (const balance of accountBalances) balances.push({ ...balance, statement: statement.file, account: name, kind });
    }
  }
  return balances;
}
