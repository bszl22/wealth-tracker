## Data

Bank and brokerage statements are sensitive and live outside this repo in `~/WealthTrackerData/`. Never copy them into the repo, commit them, or paste their contents into issues, PRs or docs. Code should read the data location from local config, not hard-code it.

To read real Statements, which a new reader's layout and every hand check need, use `npm run statement-text -- "<folder>/<file>.pdf"` (the extracted text a reader parses) and `npm run check-statements -- [filter]` (each reader's Closing Balances, then the Month-End Snapshots). Both print to the terminal only.

## Agent skills

### Issue tracker

Issues are tracked in this repo's GitHub Issues via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
