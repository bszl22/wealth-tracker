# Transfers are marked by rules, not matched automatically

A Transaction is a Transfer only when a Categorisation Rule marks it as one, such as "description contains AMERICAN EXPRESS → Transfer". The tracker does not try to pair a payment out of one Account with a payment into another. Pairing breaks when one side is never read: payments into Vanguard appear only on HSBC, since Vanguard gives no Transactions. It also breaks when the two sides are dated days apart, as with Amex bill payments, and it can wrongly pair two unrelated payments of the same amount. Rules make every Transfer something you chose, in the same place as every Category.

## Considered Options

- Automatic pairing by amount and date across Accounts. Needs no rules, but fails silently in the cases above, which would put Transfers into Spending or Earnings.
- Pairing, with rules as a fallback. Two mechanisms to understand, for little saving: there are only a handful of Transfer payees.
