/** Whole pence. Money is never held as floating-point pounds. */
export type Pence = number;

/** A calendar date as YYYY-MM-DD. */
export type IsoDate = string;

export type AccountKind = "Asset" | "Liability";

export type StatementBalance = {
  date: IsoDate;
  pence: Pence;
  source: "Closing" | "Running";
};

export type Direction = "In" | "Out";

/** A Transaction as a Statement prints it, its amount always positive and its direction saying which way it moved. */
export type StatementTransaction = {
  date: IsoDate;
  description: string;
  pence: Pence;
  direction: Direction;
};

/** One Account as a Statement reports it, with its Balances and Transactions in the order the Statement lists them. */
export type StatementAccount = {
  name: string;
  kind: AccountKind;
  balances: StatementBalance[];
  transactions: StatementTransaction[];
};

export class StatementReadError extends Error {}

/** A Statement's extracted text without its columns: no indents, and each run of spaces collapsed to one. */
export function singleSpaced(text: string): string {
  return text.replace(/^ +/gm, "").replace(/ {2,}/g, " ");
}

const MONEY = /^\d{1,3}(?:,\d{3})*\.\d{2}$/;

export function isMoney(token: string): boolean {
  return MONEY.test(token);
}

/** Parses "1,234.56" into pence without going through floating point. */
export function parsePence(money: string): Pence {
  if (!isMoney(money)) throw new StatementReadError("A Balance or Transaction could not be read");
  const [pounds, pennies] = money.replaceAll(",", "").split(".") as [string, string];
  return Number(pounds) * 100 + Number(pennies);
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** Converts a day, an English month name or abbreviation, and a year into an IsoDate. */
export function toIsoDate(day: string, month: string, year: string): IsoDate {
  const monthIndex = MONTHS.indexOf(month.slice(0, 3).toLowerCase());
  if (monthIndex < 0) throw new StatementReadError("A month name could not be read");
  const fullYear = year.length === 2 ? `20${year}` : year;
  return `${fullYear}-${String(monthIndex + 1).padStart(2, "0")}-${day.padStart(2, "0")}`;
}
