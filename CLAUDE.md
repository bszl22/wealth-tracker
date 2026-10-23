## Data

Bank and brokerage statements are sensitive and live outside this repo in `~/WealthTrackerData/`. Never copy them into the repo, commit them, or paste their contents into issues, PRs or docs. Code should read the data location from local config, not hard-code it.

To read real Statements, which a new reader's layout and every hand check need, use `npm run statement-text -- "<folder>/<file>.pdf"` (the extracted text a reader parses), `npm run check-statements -- [filter]` (each reader's Closing Balances, then the Month-End Snapshots) and `npm run check-rules -- [text]` (whether the rules file loads and the Subscriptions it gives; with text, the rule each matching Transaction gets and why its charges are or aren't a Subscription). All three print to the terminal only. Check every rules file change with `check-rules`.

Look at every page change yourself before its PR or merge: start the `made-up` preview from `.claude/launch.json` (or `PORT=<n> npm run made-up` when port 4400 is taken). It serves the page with an invented Report from `src/tools/madeUpReport.ts`, so its screenshots never show real figures. Describe in the PR's Evidence what the preview showed, and send the screenshots to the user.

## Agent skills

### Issue tracker

Issues are tracked in this repo's GitHub Issues via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
