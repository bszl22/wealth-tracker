# Coding Standards

Judgement calls the reviewer enforces. Typecheck and tests run on every commit, so leave anything they catch to them.

## Domain language

Identifiers, comments, test names and error messages use the terms defined in `GLOSSARY.md`. Check each changed name and message against the glossary's _Avoid_ lists: write "Balance" where the avoided "value" or "amount" would go, "Statement" for "report", "Account" for one account at an Institution. "Valuation" is fine, since the glossary uses it. `src/errorMessages.test.ts` already fails on the avoided words that are wrong in any error message; the reviewer covers names, comments, and avoided words whose meaning depends on context.

## Statement readers

A reader lives in `src/readers/<institution>.ts`, exports one `read<Institution>Statement(text): StatementAccount[]`, and is registered by folder name in `src/scanStatements.ts`. Model a new reader on `hsbc.ts` and `kroo.ts`:

- **Layout**: the exported reader first, then its patterns and constants, then one small helper per thing it reads (`closingBalance`, `periodEnd`, `transactionTable`). Each helper throws its own `StatementReadError("No X found")` when the thing is missing.
- **Balance order**: list Balances in the order the Statement prints them, with the Closing Balance first. On a shared date the last listed Balance wins, and the check for disagreeing Statements compares each Statement's last listed Balance on a date, so a reader that lists out of order gives a wrong Net Worth or a false conflict.
- **Cross-checked**: a reader proves it read the whole Statement by checking its figures against each other, such as each Running Balance following from the one before, the last matching the Closing Balance, or summary rows adding up to a printed total. It fails rather than guessing when they disagree.
- **Error messages** name what was missing or didn't add up in glossary terms, with no figures or descriptions from the Statement.
- **Tests** run against made-up text in the Statement's extracted layout, with a comment saying every figure is invented. Failure tests are named "fails rather than guessing when …".

## Pairing lists

Pair two lists by name, such as a Category's name or a month end, unless one module builds both and promises their order. Pairing by position is fine under that promise: the producing module states the order in its doc comment ("one entry per given month end, in the order given") and a test there checks it, as `calculateSpending` does for its lines and `buildReport` does for its months. Flag a caller that pairs by position lists built in different places, such as the rules file's Categories against a Breakdown's, since a reorder on one side gives a wrong figure under a right label with no error.
