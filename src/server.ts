import { readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { stripTypeScriptTypes } from "node:module";
import { calculateNetWorth, type Balance, type YearMonth } from "./netWorth.js";
import { loadRules, type Category, type CategorisationRule } from "./rules.js";
import { scanStatements } from "./scanStatements.js";
import type { Settings } from "./settings.js";
import { calculateSpending, type Transaction } from "./spending.js";
import type { IsoDate } from "./statements.js";

const PAGE = new URL("./page.html", import.meta.url);
const PAGE_SCRIPT = new URL("./page.ts", import.meta.url);

export type ReportInput = {
  balances: Balance[];
  transactions: Transaction[];
  categories: Category[];
  rules: CategorisationRule[];
  /** Where the rules file is, and whether it was found. */
  rulesFile: { path: string; found: boolean };
  trackingStart: YearMonth;
  today: IsoDate;
};

/** Everything the page shows: Net Worth, its Month-End Snapshots and Accounts, and Spending and Earnings. */
export type Report = ReturnType<typeof buildReport>;

/** What the page receives: the report, or why it can't be shown. */
export type ReportResponse = Report | { error: string };

/**
 * Serves the page, its script with the types stripped, and a freshly built report on every request. Binds to
 * localhost only.
 */
export function startServer(report: () => Promise<Report>, port: number): Promise<Server> {
  const server = createServer(async (request, response) => {
    if (request.url === "/") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(await readFile(PAGE));
    } else if (request.url === "/page.js") {
      response.writeHead(200, { "content-type": "text/javascript; charset=utf-8" });
      response.end(stripTypeScriptTypes(await readFile(PAGE_SCRIPT, "utf8")));
    } else if (request.url === "/report") {
      const body: ReportResponse = await report().catch((error: Error) => ({ error: error.message }));
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(body));
    } else {
      response.writeHead(404).end();
    }
  });
  return new Promise((resolve, reject) => {
    server.once("error", (error: NodeJS.ErrnoException) =>
      reject(error.code === "EADDRINUSE" ? new Error(`Port ${port} is already in use. Is the tracker already running?`) : error),
    );
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

/** The report from the Statements and rules file in the data folder, as of today. */
export async function statementsReport(settings: Settings): Promise<Report> {
  const { balances, transactions } = await scanStatements(settings.dataFolder);
  const { categories, rules, path, found } = await loadRules(settings.dataFolder);
  return buildReport({ balances, transactions, categories, rules, rulesFile: { path, found }, trackingStart: settings.trackingStart, today: localToday() });
}

export function buildReport({ balances, transactions, categories, rules, rulesFile, trackingStart, today }: ReportInput) {
  const netWorth = calculateNetWorth({ balances, trackingStart, today });
  const { snapshots } = netWorth;
  return {
    ...netWorth,
    spending: { ...calculateSpending({ transactions, snapshots, categories, rules, trackingStart, today }), categories, rulesFile },
  };
}

export function localToday(): IsoDate {
  const now = new Date();
  return [now.getFullYear(), now.getMonth() + 1, now.getDate()].map((n) => String(n).padStart(2, "0")).join("-");
}
