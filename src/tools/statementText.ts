import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { extractPdfText } from "../pdfText.js";
import { loadSettings } from "../settings.js";

// Prints one Statement's extracted text, the input a reader parses, to the terminal only.
// The path is relative to the data folder, e.g. "Vanguard Statements/10th Jan 2026 Vanguard Statement.Pdf".

const [file] = process.argv.slice(2);
try {
  if (!file) throw new Error('Usage: npm run statement-text -- "<Institution folder>/<Statement>.pdf"');
  const { dataFolder } = await loadSettings(fileURLToPath(new URL("../..", import.meta.url)));
  console.log(await extractPdfText(resolve(dataFolder, file)));
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
}
