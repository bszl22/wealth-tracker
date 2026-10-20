import { readFile } from "node:fs/promises";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

type PositionedText = { str: string; x: number; y: number };

/**
 * Extracts a PDF's selectable text as lines, top to bottom, with the items on
 * each line joined left to right by spaces. Scanned (image-only) PDFs are not supported.
 */
export async function extractPdfText(path: string): Promise<string> {
  const data = new Uint8Array(await readFile(path));
  const pdf = await getDocument({ data, isEvalSupported: false, verbosity: 0 }).promise;
  const pages: string[] = [];
  try {
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const content = await page.getTextContent();
      const items: PositionedText[] = [];
      for (const item of content.items) {
        if (!("str" in item) || item.str.trim() === "") continue;
        items.push({ str: item.str.trim(), x: item.transform[4], y: item.transform[5] });
      }
      pages.push(toLines(items).join("\n"));
    }
  } finally {
    await pdf.destroy();
  }
  return pages.join("\n");
}

const SAME_LINE_TOLERANCE = 2;

function toLines(items: PositionedText[]): string[] {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: PositionedText[][] = [];
  for (const item of sorted) {
    const line = lines.at(-1);
    if (line && Math.abs(line[0]!.y - item.y) <= SAME_LINE_TOLERANCE) line.push(item);
    else lines.push([item]);
  }
  return lines.map((line) =>
    line
      .sort((a, b) => a.x - b.x)
      .map((i) => i.str)
      .join(" "),
  );
}
