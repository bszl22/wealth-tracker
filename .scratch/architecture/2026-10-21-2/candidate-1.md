# Candidate 1: one Categorisation Rule module, shared by the server and the page

Agreed in grilling on 21 Oct 2026. Not built yet.

## What moves where

1. `src/rules.ts` becomes the browser-safe Categorisation Rule module: it imports only types from anything the server doesn't send to the page, and nothing from Node. It holds the types (`Category`, `CategoryKind`, `CategorisationRule`, `Rules`, `RuleToSave`), `readRules`, `withRule`, and everything below.
2. A new `src/rulesFile.ts` holds the disk access only: `RULES_FILE` path joining, `loadRules`, `saveRule` and its save queue, the temporary file and rename. It calls `readRules` and `withRule`.
3. `src/matching.ts` is deleted. `ruleMatches` and `previewRule` move into `rules.ts`, and `matching.test.ts` moves into `rules.test.ts`.
4. `server.ts`'s `SCRIPTS` allow-list swaps `/matching.js` for `/rules.js`.
5. `firstMatch` leaves `spending.ts`. `subscriptions.ts` stops importing from `spending.ts` for it.
6. `markedNew` and `kindOf` leave `suggestions.ts`. `suggestions.ts` keeps only what is sent to Claude and how its response is read: `aboutToSend`, `suggestionRequest`, `SUGGESTED_RULES_SCHEMA`, `suggestedRules` and `askForSuggestedRules` (ADR 0003). `suggestedRules` calls the rule module to mark what's new.

## The module's interface (beyond the existing types, `readRules` and `withRule`)

- **`categorise(rules, transaction)`** gives the first matching rule's Category and Subcategory, Transfer, or Uncategorised. Spending and Subscriptions both call it. Refund handling and the totals stay in `spending.ts`.
- **Kind ↔ direction** is one mapping (Spending ↔ Out, Earnings ↔ In). It replaces the copies in `spending.ts` and the three in `page.ts`.
- **`sameName(a, b)`** compares names ignoring case and surrounding spaces. It is used for every "is this new / already there" question:
  - `readRules`' duplicate-Category and duplicate-Subcategory checks, which become stricter: "Food" and "food" can no longer both be Categories;
  - `withAddition`'s duplicate refusal and its parent-Category lookup;
  - re-marking Suggested Rules.

  Names from the page or Claude are converted to the rules file's spelling before saving. Within the rules file, a rule must still spell its Category and Subcategory exactly as the file does. (Checked on 21 Oct 2026: the real rules file has no names that differ only by case or surrounding spaces.)
- **Trimming:** Category and Subcategory names, new or existing, are always trimmed. A rule's "contains" text is kept exactly as typed, since a space can matter ("BP " avoids "BPOST"). Blank or space-only "contains" text is still refused.
- **`kindFor(contains, uncategorised, fallback)`** gives a new Category's kind. It is Earnings when most of the Uncategorised descriptions the "contains" text catches are money in, and Spending otherwise. When the text catches none, it falls back to the direction of the row the rule was started from.
- **`markedNew(rule, { uncategorised, categories })`** moves here unchanged in purpose. It now uses `sameName` and `kindFor`.
- **`ruleToSave(unknown): RuleToSave`** checks a rule arriving to be saved and throws a specific, glossary-worded message for each problem, including a malformed `adds`.
  - `server.ts` `handleSave` calls it and answers 400 with that message.
  - `Tracker.saveRule` takes a `RuleToSave`, and `withRule` takes a typed `RuleToSave`.
  - `withRule` keeps re-reading the updated file as a backstop.
- **`adds` stays explicit.** It is the caller's "yes, this is new", which the user saw marked as new on the page. `withRule` refuses a rule whose `adds` disagrees with the rules file, now using `sameName`.

## The page

- The rule form's Kind dropdown is set from `kindFor` when the form opens. Editing a Suggested Rule uses that rule's own kind. After that, only the user changes it; it does not follow edits to the "contains" text.
- The Edit button no longer works out a direction itself. It passes the clicked row's direction as `kindFor`'s fallback.
- The page imports `ruleMatches`, `previewRule`, `kindFor`, `markedNew` and the kind ↔ direction mapping from `/rules.js`.

## Seams to test

- `rules.test.ts`:
  - absorbs `matching.test.ts` and the `markedNew` tests;
  - adds tests for `sameName`, `kindFor` (majority, tie goes to Spending, fallback when nothing is caught), `categorise` (first match wins, Transfer, Uncategorised) and `ruleToSave` (one specific error per problem, including a malformed `adds`);
  - adds a `readRules` test refusing Categories that differ only by case, and `withRule` tests that a new name differing only by case or spaces is refused and an existing name is saved in the file's spelling.
- The Spending, Subscriptions and Suggested Rules tests are unchanged apart from imports.
- `page.test.ts` gains one check that the Kind dropdown follows `kindFor` (made-up Report only).
- `rulesFile.ts` (the save queue, atomic rename) stays untested here and is picked up by candidate 2.

## As built (commit after 3ea5c89)

- `categorise` returns the winning `CategorisationRule`, or nothing for Uncategorised, rather than a separate shape. A rule already is a Category and Subcategory or a Transfer, and Subscriptions groups by the rule itself and names a group by its "contains" text.
- The Edit button passes `"Out"` as `kindFor`'s fallback, since a Suggested Rule has no row of its own. It only matters when the rule catches nothing and the user switches to "New Category…". `markedNew` uses the same fallback.
- No `page.test.ts` check was added for the Kind dropdown. In the made-up Report no description is caught in both directions, so on that data `kindFor` gives the clicked row's kind, which the existing "starts a new Category's kind as Spending for money out…" page test already checks. `kindFor` itself is tested in `rules.test.ts`. Reverting the page to the row's direction would therefore pass every page test.
- Trimming applies to names sent to be saved (by `ruleToSave`). Names read from the rules file are not trimmed, but `sameName` ignores surrounding spaces when comparing them.
