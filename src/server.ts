import { readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { stripTypeScriptTypes } from "node:module";
import type { Report, ReportResponse } from "./report.js";

const PAGE = new URL("./page.html", import.meta.url);
const PAGE_SCRIPT = new URL("./page.ts", import.meta.url);

/**
 * Serves the page, its script with the types stripped, and a freshly built Report on every request. Binds to
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
