# Candidate 3: the page tests talk to the real HTTP adapter

Agreed in grilling on 21 Oct 2026.

## What moves where

1. `server.ts` exports `handlerFor(tracker, port): (request: Request) => Promise<Response>`, using the web-standard `Request` and `Response`. It holds everything `startServer`'s callback, `handleSave`, `handleSuggest`, `bodyOf` and `postRefusal` do now: the page, the scripts with types stripped, `/report`, `/rules`, `/suggestions`, the refusals, the body limits and the 404.
2. `startServer(tracker, port)` stays in `server.ts` as the only code that touches `node:http`. It listens on 127.0.0.1, keeps the "port already in use" message, turns each `IncomingMessage` into a `Request` (body via `Readable.toWeb`, `duplex: "half"`), hands it to `handlerFor`, and writes the `Response` back.
3. `postRefusal` is no longer exported. Its four tests become handler tests.
4. `SaveResponse` and `SuggestResponse` stay in `server.ts`. `SCRIPTS` and its comment are unchanged.

## Behaviour kept

- Every status code stays as now: 403 for a refusal, 413 over a body limit, 400 for invalid JSON or a malformed rule or `ticked` list, 502 when asking Claude fails (including no key), 404 for anything else, and 200 with `{ error }` for a failed Report. The page still reads only the body; the codes are for dev tools and `curl`, and are tested.
- A body over its limit is still read to the end and discarded before the 413 is sent, now by reading `request.body` as a stream.
- The body limits (16,384 characters for a rule, 4,194,304 for the ticked rows) are unchanged.

## The page tests

- The fetch stub keeps only what a browser does: it turns the page's relative URL into `http://127.0.0.1:4400/…`, adds the `Origin` header (with a comment that the browser adds it), records the URL in `fetched`, and hands the `Request` to `handlerFor(tracker, 4400)`. The copied `/rules`, `/suggestions` and `/report` routing goes, with its `ruleToSave` call.
- `showPage` takes either the `madeUpTracker` options or a ready-made `Tracker`.
- One new page test: with `{ ...madeUpTracker(), report: () => Promise.reject(new Error("…")) }`, the page shows "Net Worth can't be shown" and the error. This path was unreachable while the stub skipped the server's error wrapping.
- The page tests keep `import("./page.js")`; they don't load the stripped scripts.

## Seams to test

`server.test.ts` goes through `handlerFor(madeUpTracker(...), PORT)`, so every figure is from the made-up Report:

- `/` gives `page.html`; each script gives `text/javascript` with the types stripped; anything else gives 404.
- **The browser-import rule:** for each `SCRIPTS` entry, fetched through the handler, every `import … from "…"` left after stripping names a path in `SCRIPTS`. A non-type import added to `suggestions.ts` now fails a test.
- `/report`: 200 with the Report; 200 with `{ error }` when the Report fails.
- `/rules`: 200 `{ saved: true }` and a following `/report` reflects the rule; 403 for each of the four former `postRefusal` cases; 413 over 16,384 characters; 400 for invalid JSON; 400 with `ruleToSave`'s message for a malformed rule.
- `/suggestions`: 200 with the Suggested Rules; 403 for a refusal; 413 over the limit; 400 for invalid JSON; 400 when `ticked` isn't a list; 502 with the key message when there's no Claude; 502 with Claude's failure message.
- **The Node adapter**, with one real server on port 0 (never the data folder): a rule POSTed with `fetch` and that port's Origin answers 200 `{ saved: true }`, which checks the `IncomingMessage` ↔ `Request` conversion, headers and streamed body included; a second server on the same port fails with the "port already in use" message. The server is closed after each.

## As built

- `SCRIPTS` is exported, so the import check in `server.test.ts` can go through each served path.
- `startServer` builds the handler with the port it is actually listening on, read from `server.address()`, so port 0 works and the Origin check matches the real port. A request Node can't turn into a `Request` gets a 400 rather than crashing the tracker.
- Routing compares the path and query together, as the old exact `request.url` match did, so `/report?month=1` is still a 404.
- The page tests run in happy-dom, whose `Request` drops an `Origin` passed to its constructor. The stub sets it on the built request afterwards, which happy-dom allows. The handler then gets happy-dom's `Request` and gives happy-dom's `Response`, and both work through the same interface.
- `showPage` waits for the Net Worth or the error panel, so the failing-Report test needs no special waiting.
- Checked that the import check fails when `suggestions.ts` gets a value import from `spending.ts`, then reverted that change.
- Checked with `npm run made-up` in a real browser: the page renders, a rule saves (200) and leaves the Uncategorised list, and a text/plain POST (403), an oversized rule (413) and an unknown path (404) answer as the tests expect.
