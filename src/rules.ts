import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

export type CategoryKind = "Spending" | "Earnings";

export type Category = { name: string; kind: CategoryKind; subcategories: string[] };

/** Gives Transactions whose description contains `contains`, ignoring case, a Category and Subcategory, or marks them as Transfers. */
export type CategorisationRule = { contains: string } & ({ category: string; subcategory: string } | { transfer: true });

export type Rules = { categories: Category[]; rules: CategorisationRule[] };

/** The rules file, at the top of the data folder. The tracker reads it, and writes it only to save a rule made on the page (ADR 0001). */
export const RULES_FILE = "rules.json";

/** The rules file's Categories and rules, where it is, and whether it was there to read. */
export type LoadedRules = Rules & { path: string; found: boolean };

/** Reads the rules file at the top of the data folder. A missing file means no rules. */
export async function loadRules(dataFolder: string): Promise<LoadedRules> {
  const path = join(dataFolder, RULES_FILE);
  const contents = await rulesFileContents(path);
  return { ...readRules(contents), path, found: contents !== undefined };
}

async function rulesFileContents(path: string): Promise<string | undefined> {
  return readFile(path, "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return undefined;
    throw new Error(`${RULES_FILE} in the data folder can't be opened`);
  });
}

/** The save in progress, so saves made together each add their rule to the file the one before wrote. */
let saving: Promise<unknown> = Promise.resolve();

/**
 * Rereads the rules file and saves it with `rule` added to the end, creating it if there is none. Writes a temporary
 * file in the data folder and renames it over the rules file, so the rules file is never left half-written.
 */
export function saveRule(dataFolder: string, rule: unknown): Promise<void> {
  const save = saving.then(async () => {
    const path = join(dataFolder, RULES_FILE);
    const updated = withRule(await rulesFileContents(path), rule);
    const temporary = `${path}.saving`;
    try {
      await writeFile(temporary, updated, "utf8");
      await rename(temporary, path);
    } catch {
      await rm(temporary, { force: true });
      throw new Error(`${RULES_FILE} in the data folder can't be written, so the rule wasn't saved`);
    }
  });
  saving = save.catch(() => undefined);
  return save;
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

/**
 * A rules file's contents with `rule` added to the end of its rules, as 2-space JSON, leaving its Categories and earlier
 * rules unchanged and in order. Fails, quoting nothing from the file, when the file or the rule doesn't read cleanly.
 */
export function withRule(contents: string | undefined, rule: unknown): string {
  try {
    readRules(contents);
  } catch {
    // The reader's message quotes the file, so only says that it failed.
    throw new Error(`${RULES_FILE} doesn't read cleanly, so the rule wasn't saved. Fix ${RULES_FILE}, then reload the page to see the problem.`);
  }
  const file = contents === undefined ? { categories: [], rules: [] } : (JSON.parse(contents) as { rules: unknown[] });
  const { contains, category, subcategory, transfer } = (rule ?? {}) as Record<string, unknown>;
  const added = transfer === true ? { contains, transfer } : { contains, category, subcategory };
  const updated = JSON.stringify({ ...file, rules: [...file.rules, added] }, null, 2) + "\n";
  try {
    readRules(updated);
  } catch {
    throw new Error(`The rule wasn't saved. It needs "contains" text, and a Category and Subcategory from ${RULES_FILE} or Transfer.`);
  }
  return updated;
}
