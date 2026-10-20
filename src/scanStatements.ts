import { readdir } from "node:fs/promises";
import { join } from "node:path";
import type { Balance } from "./netWorth.js";
import { extractPdfText } from "./pdfText.js";
import { readHsbcStatement } from "./readers/hsbc.js";
import { readKrooStatement } from "./readers/kroo.js";
import type { StatementAccount } from "./statements.js";

type StatementReader = (text: string) => StatementAccount[];

/** Each Institution folder the tracker can read. Folders not listed here are ignored. */
const READERS: Record<string, StatementReader> = {
  "HSBC Statements": readHsbcStatement,
  Kroo: readKrooStatement,
};

/** Reads every Statement PDF in the known Institution folders. Never writes to the data folder. */
export async function scanStatements(dataFolder: string): Promise<Balance[]> {
  const balances: Balance[] = [];
  for (const [folder, read] of Object.entries(READERS)) {
    const files = (await readdir(join(dataFolder, folder))).filter((f) => f.toLowerCase().endsWith(".pdf")).sort();
    for (const file of files) {
      let accounts: StatementAccount[];
      try {
        accounts = read(await extractPdfText(join(dataFolder, folder, file)));
      } catch (error) {
        throw new Error(`Could not read ${folder}/${file}: ${(error as Error).message}`);
      }
      for (const { name, kind, balances: accountBalances } of accounts) {
        for (const balance of accountBalances) balances.push({ ...balance, account: name, kind });
      }
    }
  }
  return balances;
}
