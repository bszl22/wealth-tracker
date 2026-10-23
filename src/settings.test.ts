import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadSettings } from "./settings.js";

/** Loads settings from a fresh project folder whose settings file holds `settings`, with its data folder that project folder. */
async function load(settings: Record<string, unknown>) {
  const root = await mkdtemp(join(tmpdir(), "wealth-tracker-settings-"));
  await writeFile(join(root, "settings.local.json"), JSON.stringify({ dataFolder: root, trackingStart: "2026-01", ...settings }));
  return loadSettings(root);
}

describe("the Goal in settings", () => {
  it("is optional", async () => {
    expect((await load({})).goal).toBeUndefined();
  });

  it("reads the target Net Worth in pounds and the month to reach it by", async () => {
    expect((await load({ goal: { netWorth: 30000.5, by: "2027-12" } })).goal).toEqual({ netWorth: 3000050, by: { year: 2027, month: 12 } });
  });

  it.each([
    ["without a Net Worth", { by: "2027-12" }],
    ["with a Net Worth that isn't a number", { netWorth: "30000", by: "2027-12" }],
    ["without a month", { netWorth: 30000 }],
    ["with a month that isn't one", { netWorth: 30000, by: "2027-13" }],
  ])("fails, saying how to fix it, %s", async (_, goal) => {
    await expect(load({ goal })).rejects.toThrow(/"goal" needs a "netWorth" in pounds and a "by" month, like/);
  });

  it("fails when its month is before Tracking Start", async () => {
    await expect(load({ goal: { netWorth: 30000, by: "2025-12" } })).rejects.toThrow(/"goal" is due before Tracking Start/);
  });
});
