# Wealth Tracker

A personal tool that reads bank and brokerage statements and shows how net worth changes over time.

## Language

### Money

**Net Worth**:
The total value of all Assets minus the total of all Liabilities on a given date.
_Avoid_: Wealth, total balance

**Asset**:
An Account whose Balance is money you own, such as cash or investments.

**Liability**:
An Account whose Balance is money you owe, such as a credit card.
_Avoid_: Debt (when meaning the account)

**Balance**:
The value of one Account on a given date, in GBP.
_Avoid_: Value, amount

### Sources

**Institution**:
A bank, card issuer or broker that issues Statements, such as HSBC or Vanguard.
_Avoid_: Provider, bank (when meaning any institution)

**Account**:
A single account held at an Institution, which is either an Asset or a Liability. One Institution may hold several Accounts.
_Avoid_: Institution (when meaning one account)

**Statement**:
A file issued by an Institution covering one or more Accounts over a period.
_Avoid_: Export, report

**Closing Balance**:
The Balance an Institution prints on a Statement for the end of its period. For investments, this is the printed valuation of holdings.
_Avoid_: End balance

**Running Balance**:
The Balance an Institution prints after an individual transaction on a Statement, giving the Account's Balance on dates inside the Statement's period.
_Avoid_: Line balance

### Spending

**Transaction**:
A single movement of money into or out of an Account, as listed on a Statement.
_Avoid_: Entry, line item, payment (when meaning any transaction)

**Transfer**:
A Transaction that moves money between two of your own Accounts, such as paying the Amex bill from HSBC. It counts as neither Spending nor Earnings.
_Avoid_: Internal payment

**Spending**:
Transactions that send money out to someone else, counted on the day they are made, including card purchases before the bill is paid.
_Avoid_: Outgoings, expenses

**Refund**:
Money returned by a merchant for an earlier purchase. It reduces Spending in that purchase's Category and is never Earnings.

**Earnings**:
Transactions that bring money in from someone else, such as salary or interest.
_Avoid_: Income, inflows

**Category**:
The top level of a two-level grouping for Spending and Earnings, such as Food. Each Category contains Subcategories, such as Groceries or Eating Out.
_Avoid_: Tag, label

**Categorisation Rule**:
A rule you write that gives matching Transactions a Category and Subcategory, such as "description contains NETFLIX → Entertainment › Streaming".
_Avoid_: Filter, mapping

**Uncategorised**:
The group holding every Spending or Earnings Transaction that no Categorisation Rule matches.

**Subscription**:
A payment to the same merchant for about the same amount that repeats on a regular interval, or one a Categorisation Rule puts in the Subscriptions Category. It is current if it charged within its usual interval plus a few days' grace.
_Avoid_: Recurring payment, direct debit (a direct debit is a payment method, not a subscription)

### Over time

**Month-End Snapshot**:
The Balance of every Account, and the resulting Net Worth, as of the last day of a month. Each Account uses its latest known Balance on or before that day.
_Avoid_: Data point, period

**Stale**:
Said of an Account whose latest Balance is dated more than 2 months before today. A Stale Account still counts in every Month-End Snapshot at that latest Balance.
_Avoid_: Out of date, expired

**Tracking Start**:
The first month the tracker shows a Month-End Snapshot for, currently January 2026.
_Avoid_: Start date, epoch
