# Candidate 3: reconcile overlapping Statements in one module (commit e4891dc, then the retro fix)

Not grilled first: these decisions were made during `/implement` and are recorded as built.

1. `combineStatements` becomes `reconcileStatements(reads: StatementRead[])` in `src/scanStatements.ts`. It tags each Balance and Transaction with its Account and Statement file and fails naming every unreadable file, as before. It also:
   - fails, naming both Statements, when two give different Balances for the same Account and date;
   - gives one Balance per Account and date, each Statement's last listed one on a date;
   - counts a Transaction as many times as the one Statement listing it most.
2. It returns `ReconciledStatements`, a branded type only `reconcileStatements` produces. `scanStatements` is `reconcileStatements(readStatements(...))`.
3. `ReportInput` takes `statements: ReconciledStatements` in place of `balances` and `transactions`, so every path into `buildReport`, including the made-up Report and its tests, goes through reconciliation.
4. `calculateNetWorth` drops `checkStatementsAgree`, and `calculateSpending` drops `withoutOverlaps`. Their input comments say the data is already reconciled. Net Worth keeps "the last listed wins on a shared date" as a backstop.
5. `check-statements` calls `readStatements` once, prints each read, then calls `reconcileStatements(reads)` for the Month-End Snapshots.
6. Tests: the overlap tests (disagreeing Balances, one Balance per date, Transactions counted once) live in `scanStatements.test.ts`. `report.test.ts` builds its input through `reconcileStatements`.

7. The calculators keep taking plain `Balance[]` and `Transaction[]`; only `buildReport` requires reconciled input by type. Requiring it of the calculators would push every calculator test through the overlap rules. `CODING_STANDARDS.md` › Reconciled input has the reviewer flag any other caller instead.
