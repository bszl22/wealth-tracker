# Balances come from Statements, with no market prices

Every Balance is read from a Statement: a printed Closing Balance, or a running balance printed after a transaction. The tracker never looks up market prices, so it runs fully offline and the only figures it shows are ones an Institution printed. The cost is that investments (Vanguard) are only valued on Statement dates, and their Balance is carried forward unchanged between them.

## Considered Options

- Fetching historical prices to value holdings at every month-end. More accurate between Statements, but needs the internet and a price source, and the figures would no longer match what Institutions report. Revisit if the gaps between investment Statements become a problem.
