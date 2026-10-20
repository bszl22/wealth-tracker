import { fileURLToPath } from "node:url";
import { calculateNetWorth } from "../netWorth.js";
import { readStatements, scanStatements } from "../scanStatements.js";
import { localToday } from "../server.js";
import { loadSettings } from "../settings.js";
import type { Pence } from "../statements.js";

// Prints what each reader found in every Statement, then the Month-End Snapshots, to the terminal only.
// Transactions are only counted, since their descriptions must never reach the terminal.
// For checking a reader by hand against the real Statements. An optional argument keeps only the
// Statements whose path contains it, e.g. "Vanguard".

const [only = ""] = process.argv.slice(2);
try {
  const settings = await loadSettings(fileURLToPath(new URL("../..", import.meta.url)));
  const statements = (await readStatements(settings.dataFolder)).filter((s) => s.file.includes(only));
  for (const statement of statements) {
    console.log(statement.file);
    if ("error" in statement) {
      console.log(`  Could not read: ${statement.error}`);
      continue;
    }
    for (const { name, kind, balances, transactions } of statement.accounts) {
      const closing = balances.filter((b) => b.source === "Closing");
      const running = balances.filter((b) => b.source === "Running");
      const closingText = closing.map((b) => `${pounds(b.pence)} on ${b.date}`).join(", ") || "none";
      console.log(`  ${name} (${kind}): Closing Balance ${closingText}; ${running.length} Running Balances; ${transactions.length} Transactions`);
    }
  }
  const { balances } = await scanStatements(settings.dataFolder);
  const { snapshots } = calculateNetWorth({ balances, trackingStart: settings.trackingStart, today: localToday() });
  console.log("\nMonth-End Snapshots (Net Worth = Assets - Liabilities)");
  for (const { monthEnd, assets, liabilities, netWorth } of snapshots) {
    console.log(`  ${monthEnd}  ${pounds(netWorth)} = ${pounds(assets)} - ${pounds(liabilities)}`);
  }
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
}

function pounds(pence: Pence): string {
  const sign = pence < 0 ? "-" : "";
  const [whole, pennies] = [Math.trunc(Math.abs(pence) / 100), Math.abs(pence) % 100];
  return `${sign}£${whole.toLocaleString("en-GB")}.${String(pennies).padStart(2, "0")}`;
}
