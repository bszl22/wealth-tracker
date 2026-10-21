# Candidate 2: a Breakdown names its own lines (commit 3aa561b)

1. Rows take their names from the Breakdown. `calculateSpending` promises that every month's Breakdown lists every Category of its kind and every Subcategory, in the rules file's order, at zero where nothing moved. The page's month tables, the bar chart's series and colours, and What changed all build their lines from a Breakdown. Nothing reads the rules file's Category list to lay out figures.
2. One shape for every figure. `Breakdown`, each `CategoryTotal`, each Subcategory and `uncategorised` are all `{ pence, transactions }`. Categories and Subcategories also have `name`, and Categories have `subcategories`. `total` becomes `pence`, and `uncategorisedTransactions` is removed.
3. Uncategorised is one object, kept apart from `categories`.
4. A Breakdown carries all its Transactions in `transactions`. The page's `breakdownTransactions` and the `spent` list in What changed are deleted. The Total and Net rows and Largest Spending Transactions read `breakdown.transactions`.
5. `Report.categories` is removed. The page takes its layout from the first month's Breakdowns, and shows no rows when there are no months.
6. The page's `FigureRow` takes one `figure: (month) => { pence, transactions }` accessor, so Category, Subcategory, Uncategorised, Total and Net rows are all handled the same way.
7. Tests: a new `calculateSpending` test that every month lists every Category and Subcategory in rules-file order, at zero where nothing moved, plus a check of `breakdown.transactions`. The existing tests move to `pence` and `uncategorised.transactions`. The page has no tests, so it is checked by hand against the made-up report.
