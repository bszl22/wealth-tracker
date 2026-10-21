import { readFile } from "node:fs/promises";
import { join } from "node:path";

export type CategoryKind = "Spending" | "Earnings";

export type Category = { name: string; kind: CategoryKind; subcategories: string[] };

/** Gives Transactions whose description contains `contains`, ignoring case, a Category and Subcategory, or marks them as Transfers. */
export type CategorisationRule = { contains: string } & ({ category: string; subcategory: string } | { transfer: true });

export type Rules = { categories: Category[]; rules: CategorisationRule[] };

/** The rules file, at the top of the data folder. The tracker only reads it, and doesn't yet create or write it. */
export const RULES_FILE = "rules.json";

/** The rules file's Categories and rules, where it is, and whether it was there to read. */
export type LoadedRules = Rules & { path: string; found: boolean };

/** Reads the rules file at the top of the data folder. A missing file means no rules. */
export async function loadRules(dataFolder: string): Promise<LoadedRules> {
  const path = join(dataFolder, RULES_FILE);
  const contents = await readFile(path, "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return undefined;
    throw new Error(`${RULES_FILE} in the data folder can't be opened`);
  });
  return { ...readRules(contents), path, found: contents !== undefined };
}

/** Reads a rules file's contents into its Categories and its Categorisation Rules in order. With no rules file, there are none. */
export function readRules(contents: string | undefined): Rules {
  if (contents === undefined) return { categories: [], rules: [] };
  let raw: unknown;
  try {
    raw = JSON.parse(contents);
  } catch (error) {
    // Only the position passes through, since some JSON errors quote the text around it.
    const position = /\(line \d+ column \d+\)/.exec((error as Error).message)?.[0];
    throw new Error(`${RULES_FILE} is not valid JSON${position ? ` ${position}` : ""}`);
  }
  const file = (raw ?? {}) as Record<string, unknown>;
  if (!Array.isArray(file.categories) || !Array.isArray(file.rules)) {
    throw new Error(`${RULES_FILE} needs a "categories" list and a "rules" list`);
  }
  const categories: Category[] = [];
  for (const category of file.categories) {
    const checked = checkedCategory(category);
    if (categories.some((c) => c.name === checked.name)) {
      throw new Error(`${RULES_FILE} has a Category named the same as one before it: ${JSON.stringify(category)}`);
    }
    categories.push(checked);
  }
  return { categories, rules: file.rules.map((rule) => checkedRule(rule, categories)) };
}

function checkedCategory(category: unknown): Category {
  const fail = (problem: string) => new Error(`${RULES_FILE} has a Category ${problem}: ${JSON.stringify(category)}`);
  const { name, kind, subcategories } = (category ?? {}) as Record<string, unknown>;
  const isText = (text: unknown): text is string => typeof text === "string" && text !== "";
  if (!isText(name) || !Array.isArray(subcategories) || !subcategories.every(isText)) {
    throw fail('without a "name" and a "subcategories" list');
  }
  if (new Set(subcategories).size !== subcategories.length) throw fail("listing a Subcategory twice");
  if (kind !== "Spending" && kind !== "Earnings") throw fail('whose "kind" is not "Spending" or "Earnings"');
  return { name, kind, subcategories };
}

const HOW_TO_FIX = 'Give it a Category and Subcategory, or "transfer": true';

function checkedRule(rule: unknown, categories: Category[]): CategorisationRule {
  const fail = (problem: string) => new Error(`${RULES_FILE} has a rule ${problem}: ${JSON.stringify(rule)}`);
  const { contains, category: categoryName, subcategory, transfer } = (rule ?? {}) as Record<string, unknown>;
  if (typeof contains !== "string" || contains.trim() === "") throw fail('with no "contains" text to look for');
  if (transfer === true) return { contains, transfer };
  if (transfer !== undefined) throw fail(`whose "transfer" is not true. ${HOW_TO_FIX}`);
  if (typeof categoryName !== "string") throw fail(`with no "category". ${HOW_TO_FIX}`);
  if (typeof subcategory !== "string") throw fail(`with no "subcategory". ${HOW_TO_FIX}`);
  const category = categories.find((c) => c.name === categoryName);
  if (!category) throw fail(`naming the unknown Category "${categoryName}"`);
  if (!category.subcategories.includes(subcategory)) {
    throw fail(`naming "${subcategory}", which is not a Subcategory of ${category.name}`);
  }
  return { contains, category: category.name, subcategory };
}
