import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server } from "node:http";
import { stripTypeScriptTypes } from "node:module";
import type { Report, ReportResponse } from "./report.js";
import type { SentDescription, SuggestedRule } from "./suggestions.js";

const PAGE = new URL("./page.html", import.meta.url);

/** The page's scripts, sent with the types stripped. Each imports only types from anything not listed here. */
const SCRIPTS: Record<string, URL> = {
  "/page.js": new URL("./page.ts", import.meta.url),
  "/matching.js": new URL("./matching.ts", import.meta.url),
  "/suggestions.js": new URL("./suggestions.ts", import.meta.url),
};

/**
 * What the page can ask of the tracker: the Report, saving one Categorisation Rule to the end of the rules file, and
 * Suggested Rules from Claude for the ticked rows of the about-to-send list.
 */
export type Tracker = {
  report: () => Promise<Report>;
  saveRule: (rule: unknown) => Promise<void>;
  suggestRules: (ticked: SentDescription[]) => Promise<SuggestedRule[]>;
};

/** What the page receives after saving a rule: that it was saved, or why not. */
export type SaveResponse = { saved: true } | { error: string };

/** What the page receives after asking for Suggested Rules: them, or why there are none. */
export type SuggestResponse = { suggestions: SuggestedRule[] } | { error: string };

/** The most characters a rule sent to save can hold, far more than any real rule. */
const MAX_RULE_CHARACTERS = 16_384;

/** The most characters the ticked rows sent to ask for Suggested Rules can hold, far more than any real list. */
const MAX_TICKED_CHARACTERS = 4_194_304;

/**
 * Serves the page, its scripts with the types stripped, and a freshly built Report on every request. Saves a rule,
 * and asks for Suggested Rules, only when POSTed as JSON from the page itself. Binds to localhost only.
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
    } else if (request.url === "/rules" || request.url === "/suggestions") {
      const { status, body } = await (request.url === "/rules" ? handleSave : handleSuggest)(request, tracker, port);
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
  const refusal = refusalOf(request, port);
  if (refusal) return { status: 403, body: { error: refusal } };
  const text = await bodyOf(request, MAX_RULE_CHARACTERS);
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

async function handleSuggest(request: IncomingMessage, tracker: Tracker, port: number): Promise<{ status: number; body: SuggestResponse }> {
  const refusal = refusalOf(request, port);
  if (refusal) return { status: 403, body: { error: refusal } };
  const text = await bodyOf(request, MAX_TICKED_CHARACTERS);
  if (text === undefined) return { status: 413, body: { error: "Too many descriptions are ticked to send at once." } };
  let ticked: unknown;
  try {
    ({ ticked } = JSON.parse(text) as { ticked: unknown });
  } catch {
    return { status: 400, body: { error: "The ticked descriptions aren't valid JSON." } };
  }
  if (!Array.isArray(ticked)) return { status: 400, body: { error: "The ticked descriptions need to be a list." } };
  try {
    return { status: 200, body: { suggestions: await tracker.suggestRules(ticked) } };
  } catch (error) {
    // Every message thrown on the way names what went wrong without quoting descriptions, suggestions or the API key.
    return { status: 502, body: { error: (error as Error).message } };
  }
}

const refusalOf = (request: IncomingMessage, port: number) =>
  postRefusal({ method: request.method, origin: request.headers.origin, contentType: request.headers["content-type"] }, port);

/** A request's body, or nothing when it is longer than `max` characters. Reads it all, so a response can still be sent. */
function bodyOf(request: IncomingMessage, max: number): Promise<string | undefined> {
  return new Promise((resolve, reject) => {
    let body: string | undefined = "";
    request.setEncoding("utf8");
    request.on("data", (chunk: string) => {
      if (body !== undefined) body = body.length + chunk.length > max ? undefined : body + chunk;
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

/**
 * Why a request to save a rule or ask for Suggested Rules is refused, or nothing when it is a JSON POST from the
 * tracker's own page. A web page from any other origin can still send requests to localhost, so the Origin must name
 * this server, and the body must be JSON, which another origin can't send without the browser asking this server first.
 */
export function postRefusal(
  { method, origin, contentType }: { method: string | undefined; origin: string | undefined; contentType: string | undefined },
  port: number,
): string | undefined {
  if (method !== "POST") return "The tracker only accepts a POST here.";
  if (origin !== `http://127.0.0.1:${port}` && origin !== `http://localhost:${port}`) return "Only the tracker's own page can save rules or ask for Suggested Rules.";
  if (contentType?.split(";")[0]!.trim().toLowerCase() !== "application/json") return "The tracker only accepts JSON here.";
  return undefined;
}
