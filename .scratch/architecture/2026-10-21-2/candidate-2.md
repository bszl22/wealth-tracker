# Candidate 2: one Tracker, with the made-up Report as an adapter

Agreed in grilling on 21 Oct 2026. Not built yet.

## What moves where

1. A new `src/tracker.ts` exports `createTracker(adapters): Tracker`. The `Tracker` type moves there from `server.ts`, which imports it. `createTracker` owns the wiring now written twice, in `main.ts` and `madeUpTracker`:
   - reading the Statements, then `reconcileStatements`;
   - reading the rules file with `readRules`;
   - `buildReport`;
   - saving a rule with `withRule` behind its own save queue;
   - asking for Suggested Rules with `askForSuggestedRules` on a freshly built Report.
2. `statementsReport` is deleted from `report.ts`. `report.ts` keeps `buildReport`, `monthEndsFrom` and `localToday`. `check-statements` is unchanged.
3. `main.ts` builds a Tracker from the real adapters. `madeUpTracker(options)` in `tools/madeUpReport.ts` builds one from invented adapters with a single `createTracker` call, keeping its options (`apiKeySet`, `rulesFile`, `claude`). `apiKeySet: false` means no Claude adapter.
4. The unused `madeUpReport` constant is deleted.

## The adapters `createTracker` takes

- **`readStatements: () => Promise<StatementRead[]>`.** `main.ts` passes `() => readStatements(dataFolder)`. The made-up Report passes its invented reads. The Tracker always reconciles them.
- **`rulesFile: { path: string; read(): Promise<string | undefined>; write(contents: string): Promise<void> }`.** The seam sits at the file's contents. The save queue, `withRule` and `readRules` sit above it, in the Tracker module, and both adapters live in `rulesFile.ts`:
  - `rulesFileIn(dataFolder)` reads the file, gives `undefined` when it is missing, fails with the existing "can't be opened" message otherwise, and writes through a temporary file renamed over the rules file, as now.
  - `rulesFileHolding(contents: string | undefined)` holds the contents in memory.

  `loadRules` and `saveRule` are replaced by these adapters. The Report's `rulesFile` is `{ path, found }`, found meaning `read()` gave contents.
- **`claude: AskClaude | undefined`.**
  - `main.ts` reads `ANTHROPIC_API_KEY` once and passes `claudeWith(apiKey)` when it is set, or nothing.
  - "An API key is set" in the Report becomes "a Claude adapter was given".
  - `claude.ts` exports `claudeWith(apiKey): AskClaude` and no longer reads the environment.
  - With no adapter, asking for Suggested Rules fails with the existing "ANTHROPIC_API_KEY isn't set…" message, now thrown by the Tracker.
  - What is sent, and to which model, is unchanged, so ADR 0003 and the privacy text need no update (CODING_STANDARDS › Data leaving the Mac).
- **`trackingStart: YearMonth`.** A plain value.
- **`today: () => IsoDate`.** `localToday` in `main.ts`, the fixed 12 July 2026 for the made-up Report. It is a function because the tracker can run for days.

## Behaviour kept

- Every Report, and every press of Suggest rules, rereads every Statement. There is no cache (ADR 0001).
- Each Tracker holds its own save queue in place of the module-wide `saving`. Saves made together still each build on the file the one before wrote, and a failed save doesn't block the next one.

## Seams to test

- **A new `tracker.test.ts`** goes through `createTracker` with invented Statement reads, `rulesFileHolding`, and a fake Claude. It checks:
  - the Report reflects a saved rule;
  - two saves made together both land, in order;
  - a failed write (a rules file adapter whose `write` throws) is reported, and the next save still works;
  - with no Claude adapter, the Report says no key is set and asking for Suggested Rules fails with the key message;
  - asking for Suggested Rules uses the rules file as it is now, after a save.
- **A new `rulesFile.test.ts`** checks `rulesFileIn` in a temporary folder under the system's temp directory, never the data folder:
  - a missing file reads as `undefined`;
  - a write replaces the file and leaves no `.saving` file;
  - a file that can't be opened fails with the existing message.
- **The page tests** are unchanged, and now exercise `createTracker` through `madeUpTracker`.
- **`main.ts`** stays untested, since it only passes adapters.

## As built (commit after 2a774d2)

- `scanStatements` was deleted too. It was only `reconcileStatements(await readStatements(dataFolder))`, the Tracker now does that, and its last caller was one test, which now chains the two.
- `rulesFileHolding(contents, path)` takes an optional path, so the made-up Report keeps showing "Made-up Statements/rules.json".
- `madeUpTracker({ apiKeySet: false })` now has no Claude, so asking for Suggested Rules there fails with the key message, as in the tracker. Before, it still reached `madeUpClaude`. The page test with no key only checks the disabled button and its text.
- Left as they are after review:
  - `rulesFileIn`'s write error still says "so the rule wasn't saved", although the adapter writes plain contents.
  - The Tracker's no-key message still names `ANTHROPIC_API_KEY` and `npm start`, as the spec kept it.
  - `tools/madeUpReport.ts` keeps its name, since it still makes the made-up Report the page shows.
- Checked against the real data folder once, printing only that a Report was built and its counts.
