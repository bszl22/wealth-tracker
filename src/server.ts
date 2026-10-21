import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { stripTypeScriptTypes } from "node:module";
import { Readable } from "node:stream";
import type { ReportResponse } from "./report.js";
import { ruleToSave } from "./rules.js";
import type { SuggestedRule } from "./suggestions.js";
import type { Tracker } from "./tracker.js";

const PAGE = new URL("./page.html", import.meta.url);

/** The page's scripts, sent with the types stripped. Each imports only types from anything not listed here. */
export const SCRIPTS: Record<string, URL> = {
  "/page.js": new URL("./page.ts", import.meta.url),
  "/rules.js": new URL("./rules.ts", import.meta.url),
  "/suggestions.js": new URL("./suggestions.ts", import.meta.url),
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
 * Answers one request to the tracker: the page, its scripts with the types stripped, and a freshly built Report on
 * every request. Saves a rule, and asks for Suggested Rules, only when POSTed as JSON from the page itself.
 */
export function handlerFor(tracker: Tracker, port: number): (request: Request) => Promise<Response> {
  return async (request) => {
    const { pathname, search } = new URL(request.url);
    const path = pathname + search;
    const script = SCRIPTS[path];
    if (path === "/") return new Response(await readFile(PAGE), { headers: { "content-type": "text/html; charset=utf-8" } });
    if (script) return new Response(stripTypeScriptTypes(await readFile(script, "utf8")), { headers: { "content-type": "text/javascript; charset=utf-8" } });
    if (path === "/report") {
      const body: ReportResponse = await tracker.report().catch((error: Error) => ({ error: error.message }));
      return json(200, body);
    }
    if (path === "/rules" || path === "/suggestions") {
      const { status, body } = await (path === "/rules" ? handleSave : handleSuggest)(request, tracker, port);
      return json(status, body);
    }
    return new Response(null, { status: 404 });
  };
}

/** Serves the tracker through `handlerFor`. Binds to localhost only. Port 0 picks a free port, as the tests do. */
export function startServer(tracker: Tracker, port: number): Promise<Server> {
  const server = createServer(async (incoming, outgoing) => {
    const listening = (server.address() as AddressInfo).port;
    const response = await handlerFor(tracker, listening)(requestFrom(incoming, listening)).catch(() => new Response(null, { status: 400 }));
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  });
  return new Promise((resolve, reject) => {
    server.once("error", (error: NodeJS.ErrnoException) =>
      reject(error.code === "EADDRINUSE" ? new Error(`Port ${port} is already in use. Is the tracker already running?`) : error),
    );
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

/** The web-standard Request for a request Node received, its body streamed as it arrives. */
function requestFrom(incoming: IncomingMessage, port: number): Request {
  const headers = new Headers();
  for (const [name, value] of Object.entries(incoming.headers)) {
    for (const each of [value ?? []].flat()) headers.append(name, each);
  }
  const method = incoming.method ?? "GET";
  const hasBody = method !== "GET" && method !== "HEAD";
  // A streamed body needs duplex "half", which Node requires but its RequestInit type doesn't list.
  return new Request(new URL(incoming.url ?? "/", `http://127.0.0.1:${port}`), {
    method,
    headers,
    body: hasBody ? (Readable.toWeb(incoming) as ReadableStream) : undefined,
    duplex: "half",
  } as RequestInit);
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

async function handleSave(request: Request, tracker: Tracker, port: number): Promise<{ status: number; body: SaveResponse }> {
  const refusal = refusalOf(request, port);
  if (refusal) return { status: 403, body: { error: refusal } };
  const text = await bodyOf(request, MAX_RULE_CHARACTERS);
  if (text === undefined) return { status: 413, body: { error: "The rule to save is too long." } };
  let sent: unknown;
  try {
    sent = JSON.parse(text);
  } catch {
    return { status: 400, body: { error: "The rule to save isn't valid JSON." } };
  }
  try {
    await tracker.saveRule(ruleToSave(sent));
    return { status: 200, body: { saved: true } };
  } catch (error) {
    return { status: 400, body: { error: (error as Error).message } };
  }
}

async function handleSuggest(request: Request, tracker: Tracker, port: number): Promise<{ status: number; body: SuggestResponse }> {
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

/** A request's body, or nothing when it is longer than `max` characters. Reads it all, so a response can still be sent. */
async function bodyOf(request: Request, max: number): Promise<string | undefined> {
  if (!request.body) return "";
  const decoder = new TextDecoder();
  let body: string | undefined = "";
  for await (const chunk of request.body) {
    if (body === undefined) continue;
    const text = decoder.decode(chunk, { stream: true });
    body = body.length + text.length > max ? undefined : body + text;
  }
  return body === undefined ? undefined : body + decoder.decode();
}

/**
 * Why a request to save a rule or ask for Suggested Rules is refused, or nothing when it is a JSON POST from the
 * tracker's own page. A web page from any other origin can still send requests to localhost, so the Origin must name
 * this server, and the body must be JSON, which another origin can't send without the browser asking this server first.
 */
function refusalOf(request: Request, port: number): string | undefined {
  const origin = request.headers.get("origin");
  if (request.method !== "POST") return "The tracker only accepts a POST here.";
  if (origin !== `http://127.0.0.1:${port}` && origin !== `http://localhost:${port}`) return "Only the tracker's own page can save rules or ask for Suggested Rules.";
  if (request.headers.get("content-type")?.split(";")[0]!.trim().toLowerCase() !== "application/json") return "The tracker only accepts JSON here.";
  return undefined;
}
