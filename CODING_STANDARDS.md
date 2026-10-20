# Coding Standards

Judgement calls the reviewer enforces. Typecheck and tests run on every commit, so leave anything they catch to them.

## Domain language

Identifiers, comments, test names and error messages use the terms defined in `GLOSSARY.md`. Check each changed name and message against the glossary's _Avoid_ lists: write "Balance" where the avoided "value" or "amount" would go, "Statement" for "report", "Account" for one account at an Institution. "Valuation" is fine, since the glossary uses it.

## Statement readers

A reader lives in `src/readers/<institution>.ts`, exports one `read<Institution>Statement(text): StatementAccount[]`, and is registered by folder name in `src/scanStatements.ts`. Model a new reader on `hsbc.ts` and `kroo.ts`:

- **Layout**: the exported reader first, then its patterns and constants, then one small helper per thing it reads (`closingBalance`, `periodEnd`, `runningBalances`). Each helper throws its own `StatementReadError("No X found")` when the thing is missing.
- **Cross-checked**: a reader proves it read the whole Statement by checking its figures against each other, such as each Running Balance following from the one before, the last matching the Closing Balance, or summary rows adding up to a printed total. It fails rather than guessing when they disagree.
- **Error messages** name what was missing or didn't add up in glossary terms, with no figures or descriptions from the Statement.
- **Tests** run against made-up text in the Statement's extracted layout, with a comment saying every figure is invented. Failure tests are named "fails rather than guessing when …".
