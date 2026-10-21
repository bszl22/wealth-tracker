# Claude suggests Categorisation Rules, with minimised data and approval

Transactions are categorised by Categorisation Rules you own. For Uncategorised Transactions only, the tracker asks Claude, through Anthropic's API, to suggest rules. This is the one place data leaves your Mac, so it is kept narrow: only each distinct description is sent, once, with whether money came in or went out (no amounts, dates, balances or account numbers). Every run of 4 or more digits is masked before sending, since those can be account, card or sort-code fragments and references. Transfers already marked by a rule are never sent. Nothing is sent until you press the button, and the page shows the exact list first, with any row you untick left out. Suggestions do nothing until you approve them, and they then become ordinary rules.

Direction is sent because without it Claude can't tell a Spending Category from an Earnings one for the same description. A suggestion's "contains" text is checked locally against the real, unmasked descriptions, and one that matches none is dropped.

## Considered Options

- Rules only, with no AI. Fully local, but slow to set up for hundreds of merchants.
- A local model via Ollama. Nothing leaves the machine, but it needs a multi-gigabyte download and categorises less accurately.
- Tagging each Transaction by hand. Precise but too slow.
- Sending descriptions unmasked. Simpler and slightly better suggestions, but sends digits that can identify accounts.
