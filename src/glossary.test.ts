import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const GLOSSARY = readFileSync(fileURLToPath(new URL("../GLOSSARY.md", import.meta.url)), "utf8");
const ENTRY = /^\*\*(.+?)\*\*:\n([\s\S]*?)(?=^\*\*|^#|(?![\s\S]))/gm;

/** Each glossary term, its definition, and the words its _Avoid_ line lists, leaving out ones whose wrongness depends on meaning. */
function entries(): { term: string; definition: string; avoided: string[] }[] {
  return [...GLOSSARY.matchAll(ENTRY)].map(([, term, text]) => {
    const [definition, avoid = ""] = text!.split(/^_Avoid_: /m);
    // "Debt (when meaning the account)" is fine in other senses, so the reviewer judges it rather than this test.
    const avoided = avoid.split(",").map((word) => word.trim()).filter((word) => word && !word.includes("("));
    return { term: term!, definition: definition!, avoided };
  });
}

describe("the glossary", () => {
  it("has entries with _Avoid_ lists", () => {
    expect(entries().filter(({ avoided }) => avoided.length > 0).length).toBeGreaterThan(10);
  });

  it("defines each term without the words its own _Avoid_ line lists", () => {
    const uses = entries().flatMap(({ term, definition, avoided }) =>
      avoided.filter((word) => new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(definition)).map((word) => `${term} uses "${word}"`),
    );
    expect(uses).toEqual([]);
  });
});
