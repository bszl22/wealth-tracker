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
    expect(document.querySelector(".latest")!.textContent).toBe("£39,878.80");
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

describe("the Subscriptions table", () => {
  const table = () => document.querySelector(".subscriptions table")!;

  it("lists current Subscriptions then lapsed, each largest yearly cost first, with the total yearly cost of current ones", () => {
    expect(rows(table())).toEqual([
      ["Subscription", "Interval", "Usual amount", "Last charge", "Status", "Yearly cost"],
      ["Rent (LANDLORD)", "Monthly", "£1,250.00", "1 Jul 2026", "Current", "£15,000.00"],
      ["Streaming (STREAMFLIX)", "Monthly", "£10.99", "15 Jun 2026", "Current", "£131.88"],
      ["Streaming (PHOTO CLOUD)", "Yearly", "£59.99", "8 Jul 2026", "Current", "£59.99"],
      ["Groceries (VEG BOX)", "Weekly", "£18.50", "23 Feb 2026", "Lapsed", "£962.00"],
      ["Streaming (MUSICBOX)", "Monthly", "£9.99", "20 Mar 2026", "Lapsed", "£119.88"],
      ["Total yearly cost of current Subscriptions", "", "", "", "", "£15,191.87"],
    ]);
  });

  it("lists a Subscription's Transactions when its yearly cost is clicked", () => {
    const row = [...table().querySelectorAll("tr")].find((r) => r.cells[0]!.textContent === "Streaming (STREAMFLIX)")!;
    row.querySelector<HTMLButtonElement>("button.cell")!.click();
    const listed = rows(document.querySelector(".subscriptions .transactions table")!).slice(1);
    expect(listed.map(([date, , description, amount]) => [date, description, amount])).toEqual(
      ["15 Jan 2026", "15 Feb 2026", "15 Mar 2026", "15 Apr 2026", "15 May 2026", "15 Jun 2026"].map((date) => [date, "STREAMFLIX.COM", "£10.99"]),
    );
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
      "Work › Salary", "Savings › Interest", "Transfer", "New Subcategory…", "New Category…",
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

  it("asks for a Subcategory, Transfer, or a new Category or Subcategory before saving", async () => {
    const form = makeRule("MYSTERY MERCHANT LTD");
    form.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    await vi.waitFor(() => expect(form.querySelector(".error")!.textContent).toBe("Choose a Subcategory, Transfer, or a new Category or Subcategory."));
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

  const choose = (form: HTMLFormElement, label: string) => {
    const select = choice(form);
    select.value = [...select.options].find((option) => option.textContent === label)!.value;
    select.dispatchEvent(new Event("change"));
  };
  const field = <E extends HTMLInputElement | HTMLSelectElement>(form: HTMLFormElement, name: string) => form.querySelector<E>(`[name="${name}"]`)!;
  const save = (form: HTMLFormElement) => form.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
  const offered = (description: string) => [...choice(makeRule(description)).options].map((option) => option.textContent);

  it("starts a new Category's kind as Spending for money out and Earnings for money in, and lets it be changed", () => {
    const out = makeRule("CITY PARKING 20417");
    choose(out, "New Category…");
    expect(field(out, "kind").value).toBe("Spending");
    const into = makeRule("PAYMENT FROM A FRIEND");
    choose(into, "New Category…");
    const kind = field<HTMLSelectElement>(into, "kind");
    expect(kind.value).toBe("Earnings");
    expect([...kind.options].map((option) => option.value)).toEqual(["Spending", "Earnings"]);
  });

  it("saves a new Category with one Subcategory along with the rule", async () => {
    const form = makeRule("CITY PARKING 20417");
    type(contains(form), "CITY PARKING");
    choose(form, "New Category…");
    type(field(form, "category"), "Transport");
    type(field(form, "subcategory"), "Parking");
    save(form);
    await vi.waitFor(() => expect(uncategorisedDescriptions()).toEqual(["PAYMENT FROM A FRIEND"]));
    expect(offered("PAYMENT FROM A FRIEND")).toContain("Transport › Parking");
  });

  it("saves a new Subcategory of an existing Category along with the rule", async () => {
    const form = makeRule("PAYMENT FROM A FRIEND");
    choose(form, "New Subcategory…");
    field<HTMLSelectElement>(form, "parent").value = "Work";
    type(field(form, "subcategory"), "Gifts");
    save(form);
    await vi.waitFor(() => expect(document.querySelector(".uncategorised-list .make-rule")).toBeNull());
  });

  it("refuses a new Category named the same as an existing one, saying why", async () => {
    await showPage();
    const form = makeRule("MYSTERY MERCHANT LTD");
    choose(form, "New Category…");
    type(field(form, "category"), "Food");
    type(field(form, "subcategory"), "Snacks");
    save(form);
    await vi.waitFor(() =>
      expect(form.querySelector(".error")!.textContent).toBe(
        'There is already a Category named "Food", so the rule wasn\'t saved. Choose it from the list, or give the new Category another name.',
      ),
    );
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
