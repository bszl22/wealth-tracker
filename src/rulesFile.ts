import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { RULES_FILE } from "./rules.js";

// Where the rules file's contents are kept: the rules file in the data folder, or memory for the made-up tracker.
// What the contents mean, and saving a rule into them, is up to the Tracker and rules.ts.

/** The rules file: where it is, its contents or none when there is no rules file, and writing new contents whole. */
export type RulesFile = { path: string; read(): Promise<string | undefined>; write(contents: string): Promise<void> };

/**
 * The rules file at the top of the data folder. A missing file has no contents. Writes a temporary file in the data
 * folder and renames it over the rules file, so the rules file is never left half-written.
 */
export function rulesFileIn(dataFolder: string): RulesFile {
  const path = join(dataFolder, RULES_FILE);
  return {
    path,
    read: () =>
      readFile(path, "utf8").catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return undefined;
        throw new Error(`${RULES_FILE} in the data folder can't be opened`);
      }),
    write: async (contents) => {
      const temporary = `${path}.saving`;
      try {
        await writeFile(temporary, contents, "utf8");
        await rename(temporary, path);
      } catch {
        await rm(temporary, { force: true });
        throw new Error(`${RULES_FILE} in the data folder can't be written, so the rule wasn't saved`);
      }
    },
  };
}

/** A rules file held in memory, starting with `contents`, or none, so nothing is ever written to disk. */
export function rulesFileHolding(contents: string | undefined, path = RULES_FILE): RulesFile {
  return {
    path,
    read: async () => contents,
    write: async (written) => {
      contents = written;
    },
  };
}
