# Candidate 1: a Report module that owns the months (commit 566179c)

1. A new `src/report.ts` holds `buildReport`, `ReportInput`, `Report`, `ReportResponse`, `statementsReport` and `localToday`. `server.ts` keeps only HTTP.
2. The Report holds `months: ReportMonth[]` in place of `snapshots` and `spending.months`. Each month carries its Month-End Snapshot nested as `month.snapshot`, plus `partial`, `spending`, `earnings`, `net`, `whatChanged` and `netWorthChange`. `accounts`, `uncategorised` and `rulesFile` stay at the top level. The page's headline figure reads `months.at(-1).snapshot`, and both charts take the same `months`. (`monthEnd` stays on each month as well, because the page keys its month selection on it.)
3. Change in Net Worth (`netWorthChange`, `NetWorthChange`, Other Change) moves from Spending into `report.ts`. `calculateSpending` no longer takes `snapshots`.
4. The Report module calls `monthEndsFrom(trackingStart, today)` once and passes `monthEnds` to both calculators, replacing their `trackingStart`. `today` is still passed for Stale Accounts and the partial month.
5. `monthEndsFrom` and `YearMonth` move into `report.ts`. `settings.ts` imports `YearMonth` from there. The Stale date helpers stay in `netWorth.ts`.
6. Inside `buildReport`, the calculators' results are paired by position. Each calculator's interface states "one entry per given month end, in the given order".
7. `check-statements` keeps calling `calculateNetWorth` directly, with `monthEndsFrom(settings.trackingStart, localToday())`, so a broken rules file can't block it.
8. Tests: `report.test.ts` tests `buildReport`: one month per month end, each with its own Snapshot, Spending and Earnings; the Change in Net Worth tests moved from `spending.test.ts`; Tracking Start has no Change in Net Worth. The calculator tests pass `monthEnds` in place of `trackingStart`, and the Spending tests drop `snapshots: []`.
9. `GLOSSARY.md` gains **Report** (_Avoid_: Dashboard, summary), and the Statement entry notes that "report" means the Report, never a Statement. Error messages still avoid the word.
