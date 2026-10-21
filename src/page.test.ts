// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { madeUpTracker } from "./tools/madeUpReport.js";

// Renders the page from the made-up Report, so every figure here is invented.

/** Each row of a month table, as its cells' text. */
const rows = (table: Element) => [...(table as HTMLTableElement).rows].map((row) => [...row.cells].map((cell) => cell.textContent!.trim()));

/** Every URL the page fetched, in order. */
const fetched: string[] = [];

/** Shows the page as the server does, with the made-up Report, saving rules into the made-up rules file in memory. */
async function showPage(options?: Parameters<typeof madeUpTracker>[0]) {
  const page = readFileSync(join(import.meta.dirname, "page.html"), "utf8");
  document.body.innerHTML = /<main>[\s\S]*<\/main>/.exec(page)![0];
  const tracker = madeUpTracker(options);
  fetched.length = 0;
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    fetched.push(url);
    if (url === "/rules") {
      const body = await tracker.saveRule(JSON.parse(init!.body as string)).then(
        () => ({ saved: true }),
        (error: Error) => ({ error: error.message }),
      );
      return { json: async () => body };
    }
    const report = await tracker.report();
    return { json: async () => report };
  });
  vi.resetModules();
  await import("./page.js");
  await vi.waitFor(() => expect(document.querySelector(".latest")).not.toBeNull());
}

beforeAll(() => showPage());

describe("the page", () => {
  it("shows the latest Month-End Snapshot's Net Worth", () => {
    expect(document.querySelector(".latest")!.textContent).toBe("£40,116.76");
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

describe("making a rule from an Uncategorised row", () => {
  const uncategorisedDescriptions = () =>
    [...document.querySelectorAll(".uncategorised-list td.description")].map((cell) => cell.textContent);
  const makeRule = (description: string) => {
    const row = [...document.querySelectorAll(".uncategorised-list tr")].find((r) => r.querySelector("td.description")?.textContent === description)!;
    [...row.querySelectorAll("button")].find((b) => b.textContent === "Make rule")!.click();
    return document.querySelector<HTMLFormElement>("form.rule")!;
  };
  const contains = (form: HTMLFormElement) => form.querySelector<HTMLInputElement>('input[name="contains"]')!;
  const choice = (form: HTMLFormElement) => form.querySelector<HTMLSelectElement>('select[name="then"]')!;
  const type = (input: HTMLInputElement, text: string) => {
    input.value = text;
    input.dispatchEvent(new Event("input"));
  };

  it("opens a form with the row's description as editable \"contains\" text", () => {
    expect(uncategorisedDescriptions()).toEqual(["MYSTERY MERCHANT LTD", "PAYMENT FROM A FRIEND", "CITY PARKING 20417", "CITY PARKING 20988"]);
    const form = makeRule("MYSTERY MERCHANT LTD");
    expect(contains(form).value).toBe("MYSTERY MERCHANT LTD");
  });

  it("offers the rules file's Categories and Subcategories, or Transfer", () => {
    const form = makeRule("MYSTERY MERCHANT LTD");
    const offered = [...choice(form).options].filter((option) => !option.disabled).map((option) => option.textContent);
    expect(offered).toEqual([
      "Home › Rent", "Home › Energy", "Food › Groceries", "Food › Eating Out", "Fun › Streaming", "Fun › Holidays",
      "Work › Salary", "Savings › Interest", "Transfer",
    ]);
  });

  it("shows how many Uncategorised descriptions the \"contains\" text would catch, ignoring case, and their total", () => {
    const form = makeRule("MYSTERY MERCHANT LTD");
    const preview = () => form.querySelector(".preview")!.textContent;
    expect(preview()).toBe("Catches 1 Uncategorised description: £196.00 Spending.");
    type(contains(form), "from");
    expect(preview()).toBe("Catches 1 Uncategorised description: £45.00 Earnings.");
    type(contains(form), "m");
    expect(preview()).toBe("Catches 2 Uncategorised descriptions: £196.00 Spending, £45.00 Earnings.");
    type(contains(form), "nothing like it");
    expect(preview()).toBe("Catches no Uncategorised descriptions.");
  });

  it("asks for a Subcategory or Transfer before saving", async () => {
    const form = makeRule("MYSTERY MERCHANT LTD");
    form.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    await vi.waitFor(() => expect(form.querySelector(".error")!.textContent).toBe("Choose a Subcategory or Transfer."));
  });

  it("saves the rule, then fetches the Report again so the caught Transactions move into their Category", async () => {
    const form = makeRule("MYSTERY MERCHANT LTD");
    type(contains(form), "mystery");
    const select = choice(form);
    select.value = [...select.options].find((option) => option.textContent === "Fun › Holidays")!.value;
    form.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    await vi.waitFor(() => expect(uncategorisedDescriptions()).toEqual(["PAYMENT FROM A FRIEND", "CITY PARKING 20417", "CITY PARKING 20988"]));
    const [spending] = document.querySelectorAll("table.months");
    expect(rows(spending!).find(([label]) => label === "Uncategorised")!.slice(1, 7)).toEqual(["£0.00", "£0.00", "£0.00", "£9.00", "£0.00", "£0.00"]);
  });
});

const suggest = () => document.querySelector(".suggest-rules")!;
const suggestButton = () => [...suggest().querySelectorAll("button")].find((b) => b.textContent === "Suggest rules")!;

describe("the about-to-send list for Suggested Rules", () => {
  const tickboxes = () => [...suggest().querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];

  beforeAll(() => showPage({ apiKeySet: true }));

  it("lists each distinct Uncategorised description once, masked exactly as it would be sent, with its direction, and no Transfers", () => {
    expect(rows(suggest().querySelector("table")!).slice(1).map(([, description, direction]) => [description, direction])).toEqual([
      ["MYSTERY MERCHANT LTD", "Money out"],
      ["PAYMENT FROM A FRIEND", "Money in"],
      ["CITY PARKING ####", "Money out"],
    ]);
    expect(suggest().textContent).not.toContain("THANK YOU");
  });

  it("starts with every row ticked", () => {
    expect(tickboxes().map((box) => box.checked)).toEqual([true, true, true]);
  });

  it("sends nothing when Suggest rules is pressed, and says how many ticked rows would go", () => {
    expect(suggestButton().disabled).toBe(false);
    tickboxes()[1]!.click();
    suggestButton().click();
    expect(suggest().querySelector(".sent")!.textContent).toBe("Would send 2 descriptions, but asking Claude isn't built yet, so nothing was sent.");
    expect(fetched).toEqual(["/report"]);
  });
});

describe("Suggest rules without an API key", () => {
  beforeAll(() => showPage({ apiKeySet: false }));

  it("disables the button and explains how to set a key", () => {
    expect(suggestButton().disabled).toBe(true);
    expect(suggest().querySelector(".no-key")!.textContent).toBe(
      "To ask Claude, set ANTHROPIC_API_KEY in the shell that runs npm start, then start the tracker again. Everything else works without it.",
    );
  });
});
