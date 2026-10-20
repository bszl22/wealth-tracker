import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readStatements, scanStatements } from "./scanStatements.js";

const KNOWN_FOLDERS = ["Amex Statements", "HSBC Statements", "Kroo", "Vanguard Statements"];

// Invented text standing in for a Statement's contents, which no error may quote.
const MADE_UP_CONTENTS = "Closing balance £1,234.56 PRET A MANGER";

const SUBFOLDER_ERROR = expect.stringContaining("Subfolders are not read");

let dataFolder: string;

/** A made-up data folder holding every known Institution folder, each empty. */
beforeEach(async () => {
  dataFolder = await mkdtemp(join(tmpdir(), "wealth-tracker-"));
  for (const folder of KNOWN_FOLDERS) await mkdir(join(dataFolder, folder));
});

afterEach(async () => {
  await rm(dataFolder, { recursive: true, force: true });
});

describe("readStatements", () => {
  it("fails naming a known Institution folder that is missing", async () => {
    await rm(join(dataFolder, "Kroo"), { recursive: true });
    await expect(readStatements(dataFolder)).rejects.toThrow('The data folder has no "Kroo" folder');
  });

  it("fails naming a known Institution folder that can't be opened", async () => {
    await rm(join(dataFolder, "Kroo"), { recursive: true });
    await writeFile(join(dataFolder, "Kroo"), "");
    await expect(readStatements(dataFolder)).rejects.toThrow('The "Kroo" folder in the data folder can\'t be opened');
  });

  it("ignores folders it has no reader for, such as Coinbase", async () => {
    await mkdir(join(dataFolder, "Coinbase"));
    await writeFile(join(dataFolder, "Coinbase", "statement.pdf"), "");
    expect(await readStatements(dataFolder)).toEqual([]);
  });

  it("skips hidden files such as .DS_Store", async () => {
    await writeFile(join(dataFolder, "Kroo", ".DS_Store"), "");
    expect(await readStatements(dataFolder)).toEqual([]);
  });

  it("reports a file that isn't a PDF as unreadable, naming the file but never quoting it", async () => {
    await writeFile(join(dataFolder, "Kroo", "notes.txt"), MADE_UP_CONTENTS);
    const [read] = await readStatements(dataFolder);
    expect(read).toEqual({ file: "Kroo/notes.txt", error: expect.stringContaining("Only PDF Statements can be read") });
    expect(JSON.stringify(read)).not.toContain(MADE_UP_CONTENTS);
  });

  it("reports a .pdf that isn't a readable PDF as unreadable, naming the file but never quoting it", async () => {
    await writeFile(join(dataFolder, "HSBC Statements", "2026-01.pdf"), MADE_UP_CONTENTS);
    const [read] = await readStatements(dataFolder);
    expect(read).toEqual({ file: "HSBC Statements/2026-01.pdf", error: "Not a readable PDF" });
    expect(JSON.stringify(read)).not.toContain(MADE_UP_CONTENTS);
  });

  it("reports a subfolder as unreadable rather than letting its Statements silently drop out", async () => {
    await mkdir(join(dataFolder, "Amex Statements", "Archive"));
    await mkdir(join(dataFolder, "Amex Statements", "2025.pdf"));
    expect(await readStatements(dataFolder)).toEqual([
      { file: "Amex Statements/2025.pdf", error: SUBFOLDER_ERROR },
      { file: "Amex Statements/Archive", error: SUBFOLDER_ERROR },
    ]);
  });

  it("stops with an error naming every unreadable file but never quoting it", async () => {
    await writeFile(join(dataFolder, "Kroo", "notes.txt"), MADE_UP_CONTENTS);
    await writeFile(join(dataFolder, "HSBC Statements", "2026-01.pdf"), MADE_UP_CONTENTS);
    const error = await scanStatements(dataFolder).then(
      () => undefined,
      (e: Error) => e.message,
    );
    expect(error).toContain("Could not read HSBC Statements/2026-01.pdf");
    expect(error).toContain("Could not read Kroo/notes.txt");
    expect(error).not.toContain(MADE_UP_CONTENTS);
  });
});
