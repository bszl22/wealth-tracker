import { readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { calculateNetWorth } from "./netWorth.js";
import { scanStatements } from "./scanStatements.js";
import type { Settings } from "./settings.js";
import type { IsoDate } from "./statements.js";

const PAGE = new URL("./page.html", import.meta.url);

/** Serves the page and a freshly read report on every request. Binds to localhost only. */
export function startServer(settings: Settings, port: number): Promise<Server> {
  const server = createServer(async (request, response) => {
    if (request.url === "/") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(await readFile(PAGE));
    } else if (request.url === "/report") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(await report(settings)));
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

async function report(settings: Settings) {
  try {
    const balances = await scanStatements(settings.dataFolder);
    return calculateNetWorth({ balances, trackingStart: settings.trackingStart, today: localToday() });
  } catch (error) {
    return { error: (error as Error).message };
  }
}

export function localToday(): IsoDate {
  const now = new Date();
  return [now.getFullYear(), now.getMonth() + 1, now.getDate()].map((n) => String(n).padStart(2, "0")).join("-");
}
