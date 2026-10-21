import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readStatements, reconcileStatements, type StatementRead } from "./scanStatements.js";
import type { StatementBalance, StatementTransaction } from "./statements.js";

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
    const error = await readStatements(dataFolder).then(reconcileStatements).then(
      () => undefined,
      (e: Error) => e.message,
    );
    expect(error).toContain("Could not read HSBC Statements/2026-01.pdf");
    expect(error).toContain("Could not read Kroo/notes.txt");
    expect(error).not.toContain(MADE_UP_CONTENTS);
  });
});

describe("reconcileStatements", () => {
  it("tags every Balance and Transaction with its Account and Statement file", () => {
    // Made-up reads. Every figure and description is invented.
    const reads: StatementRead[] = [
      {
        file: "HSBC Statements/2026-01.pdf",
        accounts: [
          {
            name: "HSBC",
            kind: "Asset",
            balances: [{ date: "2026-01-27", pence: 99000, source: "Closing" }],
            transactions: [
              { date: "2026-01-20", description: "VIS CORNER SHOP", pence: 1000, direction: "Out" },
              { date: "2026-01-25", description: "CR EMPLOYER LTD", pence: 250000, direction: "In" },
            ],
          },
        ],
      },
      {
        file: "Vanguard Statements/2026-01.pdf",
        accounts: [{ name: "Vanguard ISA", kind: "Asset", balances: [{ date: "2026-01-05", pence: 500000, source: "Closing" }], transactions: [] }],
      },
    ];
    expect(reconcileStatements(reads)).toEqual({
      balances: [
        { statement: "HSBC Statements/2026-01.pdf", account: "HSBC", kind: "Asset", date: "2026-01-27", pence: 99000, source: "Closing" },
        { statement: "Vanguard Statements/2026-01.pdf", account: "Vanguard ISA", kind: "Asset", date: "2026-01-05", pence: 500000, source: "Closing" },
      ],
      transactions: [
        { statement: "HSBC Statements/2026-01.pdf", account: "HSBC", date: "2026-01-20", description: "VIS CORNER SHOP", pence: 1000, direction: "Out" },
        { statement: "HSBC Statements/2026-01.pdf", account: "HSBC", date: "2026-01-25", description: "CR EMPLOYER LTD", pence: 250000, direction: "In" },
      ],
    });
  });

  it("fails rather than guessing when two Statements give different Balances for the same Account and date, naming both Statements", () => {
    const reads = [hsbcRead("HSBC Statements/January.pdf", [running("2026-01-31", 80000)]), hsbcRead("HSBC Statements/February.pdf", [running("2026-01-31", 80001)])];
    expect(() => reconcileStatements(reads)).toThrow(
      "HSBC Statements/January.pdf and HSBC Statements/February.pdf give different Balances for HSBC on 2026-01-31",
    );
  });

  it("gives one Balance per Account and date where overlapping Statements agree, taking each Statement's last listed Running Balance on a date", () => {
    const reads = [
      hsbcRead("HSBC Statements/January.pdf", [running("2026-01-20", 70000), running("2026-01-20", 75000), running("2026-01-31", 80000)]),
      hsbcRead("HSBC Statements/Mid-January.pdf", [running("2026-01-20", 75000), running("2026-01-31", 80000), running("2026-02-15", 90000)]),
    ];
    const hsbc = (statement: string, date: string, pence: number) => ({ statement, account: "HSBC", kind: "Asset", date, pence, source: "Running" });
    expect(reconcileStatements(reads).balances).toEqual([
      hsbc("HSBC Statements/January.pdf", "2026-01-20", 75000),
      hsbc("HSBC Statements/January.pdf", "2026-01-31", 80000),
      hsbc("HSBC Statements/Mid-January.pdf", "2026-02-15", 90000),
    ]);
  });

  it("counts a Transaction found in several Statements as many times as the one Statement listing it most, so overlaps count once and repeats are kept", () => {
    const coffee: StatementTransaction = { date: "2026-01-27", description: "))) COFFEE PLACE", pence: 320, direction: "Out" };
    const otherCafe = { ...coffee, description: "))) OTHER CAFE" };
    const refund = { ...coffee, direction: "In" as const };
    const reads = [
      hsbcRead("HSBC Statements/2026-01.pdf", [], [coffee, coffee]),
      hsbcRead("HSBC Statements/2026-02.pdf", [], [coffee, otherCafe, refund]),
      { file: "Kroo/2026.pdf", accounts: [{ name: "Kroo", kind: "Asset", balances: [], transactions: [coffee] }] } satisfies StatementRead,
    ];
    const tagged = (statement: string, account: string, transaction: StatementTransaction) => ({ statement, account, ...transaction });
    expect(reconcileStatements(reads).transactions).toEqual([
      tagged("HSBC Statements/2026-01.pdf", "HSBC", coffee),
      tagged("HSBC Statements/2026-01.pdf", "HSBC", coffee),
      tagged("HSBC Statements/2026-02.pdf", "HSBC", otherCafe),
      tagged("HSBC Statements/2026-02.pdf", "HSBC", refund),
      tagged("Kroo/2026.pdf", "Kroo", coffee),
    ]);
  });
});

// Made-up HSBC reads. Every figure and description is invented.
const hsbcRead = (file: string, balances: StatementBalance[], transactions: StatementTransaction[] = []): StatementRead => ({
  file,
  accounts: [{ name: "HSBC", kind: "Asset", balances, transactions }],
});

const running = (date: string, pence: number): StatementBalance => ({ date, pence, source: "Running" });
