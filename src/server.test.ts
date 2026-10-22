import { readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { handlerFor, SCRIPTS, startServer } from "./server.js";
import { madeUpTracker } from "./tools/madeUpReport.js";
import type { Tracker } from "./tracker.js";

// Every request is answered with the made-up Report, so every figure here is invented.

const PORT = 4321;
const ORIGIN = `http://127.0.0.1:${PORT}`;

const handle = (tracker: Tracker = madeUpTracker()) => handlerFor(tracker, PORT);
const get = (path: string, tracker?: Tracker) => handle(tracker)(new Request(ORIGIN + path));

/** A POST as the page sends one: JSON, from the page's own origin. */
const fromPage = (path: string, body: string, headers: Record<string, string> = {}) =>
  new Request(ORIGIN + path, { method: "POST", headers: { origin: ORIGIN, "content-type": "application/json", ...headers }, body });

const answer = async (response: Response) => ({ status: response.status, body: await response.json() });

const rule = { contains: "mystery", category: "Fun", subcategory: "Holidays" };
const ticked = [{ description: "MYSTERY MERCHANT LTD", direction: "Out" }];

describe("the page and its scripts", () => {
  it("serves the page at /", async () => {
    const response = await get("/");
    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(await response.text()).toBe(readFileSync(new URL("./page.html", import.meta.url), "utf8"));
  });

  it("serves each script as JavaScript with the types stripped", async () => {
    for (const path of Object.keys(SCRIPTS)) {
      const response = await get(path);
      expect(response.headers.get("content-type")).toBe("text/javascript; charset=utf-8");
      expect(await response.text()).not.toMatch(/\bimport type\b/);
    }
  });

  it("serves scripts that import only other served scripts once their types are stripped", async () => {
    for (const path of Object.keys(SCRIPTS)) {
      const script = await (await get(path)).text();
      const imported = [...script.matchAll(/\bfrom\s*"([^"]+)"|\bimport\s*\(?\s*"([^"]+)"/g)].map(([, from, bare]) => from ?? bare!);
      for (const each of imported) expect(Object.keys(SCRIPTS), `${path} imports ${each}`).toContain(new URL(each, ORIGIN + path).pathname);
    }
  });

  it("answers anything else with 404", async () => {
    expect((await get("/rules.json")).status).toBe(404);
    expect((await get("/report?month=1")).status).toBe(404);
  });
});

describe("/report", () => {
  it("gives the Report", async () => {
    const { status, body } = await answer(await get("/report"));
    expect(status).toBe(200);
    expect(body.months.length).toBeGreaterThan(0);
  });

  it("gives why the Report can't be built, in place of it", async () => {
    const failing = { ...madeUpTracker(), report: () => Promise.reject(new Error("No Closing Balance found")) };
    expect(await answer(await get("/report", failing))).toEqual({ status: 200, body: { error: "No Closing Balance found" } });
  });
});

// The same refusals guard saving a rule and asking Claude for Suggested Rules.
describe.each([
  ["/rules", JSON.stringify(rule)],
  ["/suggestions", JSON.stringify({ ticked })],
])("refusing a request to %s", (path, body) => {
  const refused = async (request: Request) => answer(await handle()(request));

  it("accepts a JSON POST from the page's own origin, however the page was opened", async () => {
    expect((await refused(fromPage(path, body))).status).toBe(200);
    expect((await refused(fromPage(path, body, { origin: `http://localhost:${PORT}` }))).status).toBe(200);
    expect((await refused(fromPage(path, body, { "content-type": "application/json; charset=utf-8" }))).status).toBe(200);
  });

  it("refuses another origin, a missing origin and the right host on another port", async () => {
    const elsewhere = ["https://example.com", "null", `http://127.0.0.1:${PORT + 1}`, `https://127.0.0.1:${PORT}`].map((origin) => fromPage(path, body, { origin }));
    const noOrigin = new Request(ORIGIN + path, { method: "POST", headers: { "content-type": "application/json" }, body });
    for (const request of [...elsewhere, noOrigin]) {
      expect(await refused(request)).toEqual({ status: 403, body: { error: "Only the tracker's own page can save rules or ask for Suggested Rules." } });
    }
  });

  it("refuses a body that isn't JSON, such as a form a web page could post", async () => {
    const noContentType = new Request(ORIGIN + path, { method: "POST", headers: { origin: ORIGIN }, body: new Blob([body]) });
    const requests = ["text/plain", "application/x-www-form-urlencoded"].map((contentType) => fromPage(path, body, { "content-type": contentType }));
    for (const request of [...requests, noContentType]) {
      expect(await refused(request)).toEqual({ status: 403, body: { error: "The tracker only accepts JSON here." } });
    }
  });

  it("refuses anything but a POST", async () => {
    expect(await refused(new Request(ORIGIN + path, { headers: { origin: ORIGIN } }))).toEqual({ status: 403, body: { error: "The tracker only accepts a POST here." } });
  });
});

describe("/rules", () => {
  it("saves the rule, so the next Report has it", async () => {
    const tracker = madeUpTracker();
    expect(await answer(await handle(tracker)(fromPage("/rules", JSON.stringify(rule))))).toEqual({ status: 200, body: { saved: true } });
    const { body } = await answer(await get("/report", tracker));
    expect(body.uncategorised.map(({ description }: { description: string }) => description)).not.toContain("MYSTERY MERCHANT LTD");
  });

  it("refuses a rule adding a Category named Subscriptions, saving nothing", async () => {
    const tracker = madeUpTracker();
    const subscriptions = { ...rule, category: "Subscriptions", subcategory: "Streaming", adds: { new: "Category", kind: "Spending" } };
    expect(await answer(await handle(tracker)(fromPage("/rules", JSON.stringify(subscriptions))))).toEqual({
      status: 400,
      body: {
        error: 'Subscriptions is a view across Categories, not a Category, so the rule wasn\'t saved. Sort it into a Category for what it is for, and tick "This is a Subscription" instead.',
      },
    });
    const { body } = await answer(await get("/report", tracker));
    expect(body.uncategorised.map(({ description }: { description: string }) => description)).toContain("MYSTERY MERCHANT LTD");
  });

  it("refuses a rule longer than any real one", async () => {
    const long = JSON.stringify({ ...rule, contains: "x".repeat(16_384) });
    expect(await answer(await handle()(fromPage("/rules", long)))).toEqual({ status: 413, body: { error: "The rule to save is too long." } });
  });

  it("refuses a rule that isn't valid JSON", async () => {
    expect(await answer(await handle()(fromPage("/rules", "{ contains")))).toEqual({ status: 400, body: { error: "The rule to save isn't valid JSON." } });
  });

  it("refuses a malformed rule, saying what is wrong with it", async () => {
    expect(await answer(await handle()(fromPage("/rules", JSON.stringify({ ...rule, contains: " " }))))).toEqual({
      status: 400,
      body: { error: 'The rule has no "contains" text to look for, so it wasn\'t saved.' },
    });
  });
});

describe("/suggestions", () => {
  it("gives Claude's Suggested Rules for the ticked descriptions", async () => {
    const { status, body } = await answer(await handle()(fromPage("/suggestions", JSON.stringify({ ticked }))));
    expect(status).toBe(200);
    expect(body.suggestions.map(({ contains }: { contains: string }) => contains)).toEqual(["MYSTERY MERCHANT"]);
  });

  it("refuses more ticked descriptions than any real list", async () => {
    const many = JSON.stringify({ ticked: [{ description: "x".repeat(4_194_304), direction: "Out" }] });
    expect(await answer(await handle()(fromPage("/suggestions", many)))).toEqual({ status: 413, body: { error: "Too many descriptions are ticked to send at once." } });
  });

  it("refuses ticked descriptions that aren't valid JSON, or aren't a list", async () => {
    expect(await answer(await handle()(fromPage("/suggestions", "{ ticked")))).toEqual({ status: 400, body: { error: "The ticked descriptions aren't valid JSON." } });
    expect(await answer(await handle()(fromPage("/suggestions", JSON.stringify({ ticked: "all" }))))).toEqual({
      status: 400,
      body: { error: "The ticked descriptions need to be a list." },
    });
  });

  it("says why nothing was suggested when no API key is set", async () => {
    expect(await answer(await handle(madeUpTracker({ apiKeySet: false }))(fromPage("/suggestions", JSON.stringify({ ticked }))))).toEqual({
      status: 502,
      body: { error: "ANTHROPIC_API_KEY isn't set, so Claude can't be asked. Set it in the shell that runs npm start, then start the tracker again." },
    });
  });

  it("says why nothing was suggested when Claude fails", async () => {
    const claude = async () => {
      throw new Error("Claude couldn't be reached, so nothing was suggested. Check your internet connection and try again.");
    };
    expect(await answer(await handle(madeUpTracker({ claude }))(fromPage("/suggestions", JSON.stringify({ ticked }))))).toEqual({
      status: 502,
      body: { error: "Claude couldn't be reached, so nothing was suggested. Check your internet connection and try again." },
    });
  });
});

describe("startServer", () => {
  it("passes what Node receives to the handler, headers and body included, and sends back its answer", async () => {
    const server = await startServer(madeUpTracker(), 0);
    try {
      const { port } = server.address() as AddressInfo;
      const response = await fetch(`http://127.0.0.1:${port}/rules`, {
        method: "POST",
        headers: { origin: `http://127.0.0.1:${port}`, "content-type": "application/json" },
        body: JSON.stringify(rule),
      });
      expect(response.headers.get("content-type")).toBe("application/json");
      expect(await answer(response)).toEqual({ status: 200, body: { saved: true } });
    } finally {
      server.close();
    }
  });

  it("says when the port is already in use", async () => {
    const server = await startServer(madeUpTracker(), 0);
    try {
      const { port } = server.address() as AddressInfo;
      await expect(startServer(madeUpTracker(), port)).rejects.toThrow(`Port ${port} is already in use. Is the tracker already running?`);
    } finally {
      server.close();
    }
  });
});
