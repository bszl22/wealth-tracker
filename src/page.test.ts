// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { madeUpReport } from "./tools/madeUpReport.js";

// Renders the page from the made-up Report, so every figure here is invented.

/** Each row of a month table, as its cells' text. */
const rows = (table: Element) => [...(table as HTMLTableElement).rows].map((row) => [...row.cells].map((cell) => cell.textContent!.trim()));

beforeAll(async () => {
  const page = readFileSync(join(import.meta.dirname, "page.html"), "utf8");
  document.body.innerHTML = /<main>[\s\S]*<\/main>/.exec(page)![0];
  vi.stubGlobal("fetch", async () => ({ json: async () => madeUpReport }));
  await import("./page.js");
  await vi.waitFor(() => expect(document.querySelector(".latest")).not.toBeNull());
});

describe("the page", () => {
  it("shows the latest Month-End Snapshot's Net Worth", () => {
    expect(document.querySelector(".latest")!.textContent).toBe("£40,125.76");
  });

  it("lists every Spending Category and Subcategory, Uncategorised and the total, one column per month", () => {
    const [spending] = document.querySelectorAll("table.months");
    const table = rows(spending!);
    expect(table[0]).toEqual(["Spending", "Jan 26", "Feb 26", "Mar 26", "Apr 26", "May 26", "Jun 26", "Jul 26 so far"]);
    expect(table.slice(1).map(([label]) => label)).toEqual([
      "Home", "Rent", "Energy", "Food", "Groceries", "Eating Out", "Fun", "Streaming", "Holidays", "Uncategorised", "Total Spending",
    ]);
    expect(table.find(([label]) => label === "Total Spending")![5]).toBe("£3,297.49");
  });

  it("lists every Earnings Category, Uncategorised, the total and the Net", () => {
    const [, earnings] = document.querySelectorAll("table.months");
    const table = rows(earnings!);
    expect(table.slice(1).map(([label]) => label)).toEqual([
      "Work", "Salary", "Savings", "Interest", "Uncategorised", "Total Earnings", "Net (Earnings − Spending)",
    ]);
    expect(table.at(-1)![6]).toBe("£1,439.21");
  });

  it("stacks each month's Spending bar by Spending Category, then Uncategorised", () => {
    const legend = [...document.querySelectorAll(".legend.swatches span")].map((span) => span.textContent);
    expect(legend).toEqual(["Home", "Food", "Fun", "Uncategorised"]);
  });

  it("flags a Stale Account", () => {
    const stale = [...document.querySelectorAll("tr")].filter((row) => row.querySelector(".stale"));
    expect(stale.map((row) => row.cells[0]!.textContent)).toEqual(["Old Easy Access"]);
  });
});
