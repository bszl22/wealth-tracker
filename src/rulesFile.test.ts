import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { rulesFileIn } from "./rulesFile.js";

// A made-up data folder in the system's temp directory, never the real one. Every rule is invented.
let dataFolder: string;
beforeEach(async () => {
  dataFolder = await mkdtemp(join(tmpdir(), "wealth-tracker-"));
});
afterEach(() => rm(dataFolder, { recursive: true, force: true }));

describe("rulesFileIn", () => {
  it("is the rules file at the top of the data folder", () => {
    expect(rulesFileIn(dataFolder).path).toBe(join(dataFolder, "rules.json"));
  });

  it("reads no contents when there is no rules file", async () => {
    expect(await rulesFileIn(dataFolder).read()).toBeUndefined();
  });

  it("writes the rules file's contents whole, replacing what was there and leaving no temporary file", async () => {
    const rulesFile = rulesFileIn(dataFolder);
    await writeFile(rulesFile.path, '{"categories": [], "rules": []}');
    await rulesFile.write('{"categories": [], "rules": [{"contains": "CARD BILL", "transfer": true}]}');
    expect(await rulesFile.read()).toBe('{"categories": [], "rules": [{"contains": "CARD BILL", "transfer": true}]}');
    expect(await readdir(dataFolder)).toEqual(["rules.json"]);
  });

  it("fails without quoting the rules file when it can't be opened or written", async () => {
    const rulesFile = rulesFileIn(dataFolder);
    await mkdir(rulesFile.path);
    await expect(rulesFile.read()).rejects.toThrow(new Error("rules.json in the data folder can't be opened"));
    await expect(rulesFile.write("{}")).rejects.toThrow(new Error("rules.json in the data folder can't be written, so the rule wasn't saved"));
    expect(await readdir(dataFolder)).toEqual(["rules.json"]);
  });
});
