import { readdir } from "node:fs/promises";
import { join } from "node:path";
import type { Balance } from "./netWorth.js";
import { extractPdfText } from "./pdfText.js";
import { readAmexStatement } from "./readers/amex.js";
import { readHsbcStatement } from "./readers/hsbc.js";
import { readKrooStatement } from "./readers/kroo.js";
import { readVanguardStatement } from "./readers/vanguard.js";
import type { StatementAccount } from "./statements.js";

type StatementReader = (text: string) => StatementAccount[];

/** Each Institution folder the tracker can read. Folders not listed here are ignored. */
const READERS: Record<string, StatementReader> = {
  "Amex Statements": readAmexStatement,
  "HSBC Statements": readHsbcStatement,
  Kroo: readKrooStatement,
  "Vanguard Statements": readVanguardStatement,
};

/** One Statement PDF and the Accounts its reader found, or why it could not be read. */
export type StatementRead = { file: string } & ({ accounts: StatementAccount[] } | { error: string });

/** Reads every Statement PDF in the known Institution folders, one result per file. Never writes to the data folder. */
export async function readStatements(dataFolder: string): Promise<StatementRead[]> {
  const reads: StatementRead[] = [];
  for (const [folder, read] of Object.entries(READERS)) {
    const files = (await readdir(join(dataFolder, folder))).filter((f) => f.toLowerCase().endsWith(".pdf")).sort();
    for (const file of files) {
      const path = `${folder}/${file}`;
      try {
        reads.push({ file: path, accounts: read(await extractPdfText(join(dataFolder, folder, file))) });
      } catch (error) {
        reads.push({ file: path, error: (error as Error).message });
      }
    }
  }
  return reads;
}

/** Every Balance from every Statement, failing on the first Statement that could not be read. */
export async function scanStatements(dataFolder: string): Promise<Balance[]> {
  const balances: Balance[] = [];
  for (const statement of await readStatements(dataFolder)) {
    if ("error" in statement) throw new Error(`Could not read ${statement.file}: ${statement.error}`);
    for (const { name, kind, balances: accountBalances } of statement.accounts) {
      for (const balance of accountBalances) balances.push({ ...balance, account: name, kind });
    }
  }
  return balances;
}
