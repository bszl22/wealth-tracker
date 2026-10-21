import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { readRules, RULES_FILE, withRule, type Rules, type RuleToSave } from "./rules.js";

// Reading and writing the rules file in the data folder. What a rule means, and whether one can be saved, is up to
// rules.ts.

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
export function saveRule(dataFolder: string, rule: RuleToSave): Promise<void> {
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
