import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server } from "node:http";
import { stripTypeScriptTypes } from "node:module";
import type { Report, ReportResponse } from "./report.js";

const PAGE = new URL("./page.html", import.meta.url);

/** The page's scripts, sent with the types stripped. Each imports only types from anything not listed here. */
const SCRIPTS: Record<string, URL> = {
  "/page.js": new URL("./page.ts", import.meta.url),
  "/matching.js": new URL("./matching.ts", import.meta.url),
};

/** What the page can ask of the tracker: the Report, and saving one Categorisation Rule to the end of the rules file. */
export type Tracker = { report: () => Promise<Report>; saveRule: (rule: unknown) => Promise<void> };

/** What the page receives after saving a rule: that it was saved, or why not. */
export type SaveResponse = { saved: true } | { error: string };

/** The most characters a rule sent to save can hold, far more than any real rule. */
const MAX_RULE_CHARACTERS = 16_384;

/**
 * Serves the page, its scripts with the types stripped, a freshly built Report on every request, and saves a rule
 * POSTed as JSON from the page itself. Binds to localhost only.
 */
export function startServer(tracker: Tracker, port: number): Promise<Server> {
  const server = createServer(async (request, response) => {
    const script = request.url ? SCRIPTS[request.url] : undefined;
    if (request.url === "/") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(await readFile(PAGE));
    } else if (script) {
      response.writeHead(200, { "content-type": "text/javascript; charset=utf-8" });
      response.end(stripTypeScriptTypes(await readFile(script, "utf8")));
    } else if (request.url === "/report") {
      const body: ReportResponse = await tracker.report().catch((error: Error) => ({ error: error.message }));
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(body));
    } else if (request.url === "/rules") {
      const { status, body } = await handleSave(request, tracker, port);
      response.writeHead(status, { "content-type": "application/json" });
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

async function handleSave(request: IncomingMessage, tracker: Tracker, port: number): Promise<{ status: number; body: SaveResponse }> {
  const refusal = saveRefusal({ method: request.method, origin: request.headers.origin, contentType: request.headers["content-type"] }, port);
  if (refusal) return { status: 403, body: { error: refusal } };
  const text = await bodyOf(request);
  if (text === undefined) return { status: 413, body: { error: "The rule to save is too long." } };
  let rule: unknown;
  try {
    rule = JSON.parse(text);
  } catch {
    return { status: 400, body: { error: "The rule to save isn't valid JSON." } };
  }
  try {
    await tracker.saveRule(rule);
    return { status: 200, body: { saved: true } };
  } catch (error) {
    return { status: 400, body: { error: (error as Error).message } };
  }
}

/** A request's body, or nothing when it is too long to be a rule. Reads it all, so a response can still be sent. */
function bodyOf(request: IncomingMessage): Promise<string | undefined> {
  return new Promise((resolve, reject) => {
    let body: string | undefined = "";
    request.setEncoding("utf8");
    request.on("data", (chunk: string) => {
      if (body !== undefined) body = body.length + chunk.length > MAX_RULE_CHARACTERS ? undefined : body + chunk;
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

/**
 * Why a request to save a rule is refused, or nothing when it is a JSON POST from the tracker's own page. A web page
 * from any other origin can still send requests to localhost, so the Origin must name this server, and the body must
 * be JSON, which another origin can't send without the browser asking this server first.
 */
export function saveRefusal(
  { method, origin, contentType }: { method: string | undefined; origin: string | undefined; contentType: string | undefined },
  port: number,
): string | undefined {
  if (method !== "POST") return "Rules are saved with a POST.";
  if (origin !== `http://127.0.0.1:${port}` && origin !== `http://localhost:${port}`) return "Only the tracker's own page can save rules.";
  if (contentType?.split(";")[0]!.trim().toLowerCase() !== "application/json") return "Rules are saved as JSON.";
  return undefined;
}
