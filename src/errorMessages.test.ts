import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Words from GLOSSARY.md's Avoid lists that are wrong in any error message. Avoided words that
// depend on meaning, such as "period" (fine for a Statement's period), are left to the reviewer.
const AVOIDED = ["amount", "value", "report", "export", "provider", "end balance", "line balance", "total balance", "wealth", "income", "expenses"];

const SRC = fileURLToPath(new URL(".", import.meta.url));
const MESSAGE = /(?:StatementReadError|Error)\(\s*(["'`])(.*?)\1/gs;

function errorMessages(): { file: string; message: string }[] {
  const files = readdirSync(SRC, { recursive: true, encoding: "utf8" }).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
  return files.flatMap((file) =>
    [...readFileSync(join(SRC, file), "utf8").matchAll(MESSAGE)].map((match) => ({ file, message: match[2]! })),
  );
}

describe("error messages", () => {
  it("are found in the source", () => {
    expect(errorMessages().length).toBeGreaterThan(10);
  });

  it("use the glossary's terms, never its avoided words", () => {
    const pattern = new RegExp(`\\b(?:${AVOIDED.join("|")})\\b`, "i");
    expect(errorMessages().filter(({ message }) => pattern.test(message))).toEqual([]);
  });
});
