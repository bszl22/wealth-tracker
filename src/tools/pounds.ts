import type { Pence } from "../statements.js";

/** Pence as pounds for the terminal, like "-£1,234.05". */
export function pounds(pence: Pence): string {
  const sign = pence < 0 ? "-" : "";
  const [whole, pennies] = [Math.trunc(Math.abs(pence) / 100), Math.abs(pence) % 100];
  return `${sign}£${whole.toLocaleString("en-GB")}.${String(pennies).padStart(2, "0")}`;
}
