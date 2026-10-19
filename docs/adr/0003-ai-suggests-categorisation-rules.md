# Claude suggests Categorisation Rules, with minimised data and approval

Transactions are categorised by Categorisation Rules you own. For Uncategorised Transactions only, the tracker asks Claude, through Anthropic's API, to suggest rules. This is the one place data leaves your Mac, so it is kept narrow: only the descriptions are sent (no amounts, dates, balances or account numbers), each merchant is sent once, Transfers are never sent, and the page shows the exact list before sending. Suggestions do nothing until you approve them, and they then become ordinary rules.

## Considered Options

- Rules only, with no AI. Fully local, but slow to set up for hundreds of merchants.
- A local model via Ollama. Nothing leaves the machine, but it needs a multi-gigabyte download and categorises less accurately.
- Tagging each Transaction by hand. Precise but too slow.
