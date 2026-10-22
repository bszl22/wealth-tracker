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
_Avoid_: Export, report (a report is the Report, never a Statement)

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
A Transaction that moves money between your own Accounts, or within one, such as paying the Amex bill from HSBC or moving money to a Kroo pot. A Categorisation Rule marks it as a Transfer, and it counts as neither Spending nor Earnings.
_Avoid_: Internal payment

**Spending**:
Transactions that send money out to someone else, counted on the day they are made, including card purchases before the bill is paid.
_Avoid_: Outgoings, expenses

**Refund**:
Money coming in that a Categorisation Rule puts in a Spending Category, such as a merchant returning money for an earlier purchase. It reduces Spending in that Category and is never Earnings.

**Earnings**:
Transactions that bring money in from someone else, such as salary or bank interest. Money going out under an Earnings Category reduces Earnings. Dividends and growth inside an investment Account are not Earnings: they show only in that Account's Balance.
_Avoid_: Income, inflows

**Category**:
The top level of a two-level grouping, such as Food. Each Category is either a Spending Category or an Earnings Category, and contains Subcategories, such as Groceries or Eating Out. No two Categories, and no two Subcategories of one Category, share a name, ignoring case and surrounding spaces.
_Avoid_: Tag, label

**Categorisation Rule**:
A rule you write that gives matching Transactions a Category and Subcategory, or marks them as Transfers, such as "description contains NETFLIX → Entertainment › Streaming". When several rules match a Transaction, the first in your list wins.
_Avoid_: Filter, mapping

**Uncategorised**:
The group holding every Spending or Earnings Transaction that no Categorisation Rule matches.

**One-off**:
An Uncategorised description with exactly one Transaction. One-offs are shown together rather than one by one, since they are rarely worth a Categorisation Rule.
_Avoid_: Miscellaneous, sundry

**Subscription**:
Spending that repeats on a regular interval for about the same amount. Most are found from the Transactions themselves: those matched by the same Categorisation Rule, or sharing one description when no rule matches. Others are declared: a Categorisation Rule you mark as catching a Subscription makes its Transactions one from the first charge, before enough charges exist to find it. Its Transactions keep their own Category, so Subscriptions are a view across Categories, never a Category. It is lapsed only when its next charge, plus a few days' grace, falls inside the period its Account's Statements cover and no charge came; otherwise it is current.
_Avoid_: Recurring payment, direct debit (a direct debit is a payment method, not a subscription), merchant (when meaning who a Subscription pays)

**Suggested Rule**:
A Categorisation Rule Claude proposes for Uncategorised Transactions. It may name a new Category or Subcategory, marked as new. It changes nothing until you approve it, and then it is an ordinary Categorisation Rule, adding any new Category or Subcategory it names.
_Avoid_: AI rule, recommendation

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

**Other Change**:
The part of a month's change in Net Worth that Earnings minus Spending doesn't explain, such as investment growth or timing between purchases and Statement dates.
_Avoid_: Unexplained, residual

**Report**:
Everything the tracker shows at once: each month from Tracking Start through today with its Month-End Snapshot, Spending, Earnings and change in Net Worth, plus each Account's latest Balance, the Uncategorised Transactions, the Subscriptions, the Categories to make Categorisation Rules with, and whether an API key is set to ask for Suggested Rules.
_Avoid_: Dashboard, summary
