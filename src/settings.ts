import { readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";
import type { YearMonth } from "./report.js";

export type Settings = { dataFolder: string; trackingStart: YearMonth };

const SETTINGS_FILE = "settings.local.json";
const HOW_TO_FIX = `Copy settings.example.json to ${SETTINGS_FILE} and fill in your data folder and Tracking Start.`;

/** Loads the git-ignored local settings file from the project root, failing with how to fix it. */
export async function loadSettings(projectRoot: string): Promise<Settings> {
  const path = resolve(projectRoot, SETTINGS_FILE);
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    const reason = code === "ENOENT" ? "is missing" : error instanceof SyntaxError ? "is not valid JSON" : "can't be opened";
    throw new Error(`${SETTINGS_FILE} ${reason}. ${HOW_TO_FIX}`);
  }
  const { dataFolder, trackingStart } = (raw ?? {}) as Record<string, unknown>;
  if (typeof dataFolder !== "string" || dataFolder === "") {
    throw new Error(`${SETTINGS_FILE} needs "dataFolder", the folder holding your Statements. ${HOW_TO_FIX}`);
  }
  const start = typeof trackingStart === "string" ? /^(\d{4})-(0[1-9]|1[0-2])$/.exec(trackingStart) : null;
  if (!start) {
    throw new Error(`${SETTINGS_FILE} needs "trackingStart" as a year and month, like "2026-01".`);
  }
  const folder = resolve(dataFolder.replace(/^~(?=$|\/)/, homedir()));
  const isFolder = await stat(folder).then((s) => s.isDirectory(), () => false);
  if (!isFolder) throw new Error(`The data folder in ${SETTINGS_FILE} does not exist: ${folder}`);
  return { dataFolder: folder, trackingStart: { year: Number(start[1]), month: Number(start[2]) } };
}
