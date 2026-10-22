// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { handlerFor } from "./server.js";
import type { SuggestionRequest } from "./suggestions.js";
import { madeUpClaude, madeUpTracker } from "./tools/madeUpReport.js";
import type { Tracker } from "./tracker.js";

// Renders the page from the made-up Report, so every figure here is invented.

/** Each row of a month table, as its cells' text. */
const rows = (table: Element) => [...(table as HTMLTableElement).rows].map((row) => [...row.cells].map((cell) => cell.textContent!.trim()));

/** Every URL the page fetched, in order. */
const fetched: string[] = [];

/** The port `npm run made-up` serves the page on. */
const PORT = 4400;
const ORIGIN = `http://127.0.0.1:${PORT}`;

/**
 * Shows the page as the server does, with the made-up Report, or the Tracker given, saving rules into the made-up rules
 * file in memory. Every request goes through the server's own handler.
 */
async function showPage(options?: Parameters<typeof madeUpTracker>[0] | Tracker) {
  const page = readFileSync(join(import.meta.dirname, "page.html"), "utf8");
  document.body.innerHTML = /<main>[\s\S]*<\/main>/.exec(page)![0];
  const handle = handlerFor(options && "report" in options ? options : madeUpTracker(options), PORT);
  fetched.length = 0;
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    fetched.push(url);
    // The browser adds the Origin itself. happy-dom's Request drops one passed in, so it is set afterwards, as a browser would.
    const request = new Request(ORIGIN + url, init);
    request.headers.set("origin", ORIGIN);
    return handle(request);
  });
  vi.resetModules();
  await import("./page.js");
  await vi.waitFor(() => expect(document.querySelector(".latest, #content .error")).not.toBeNull());
}

beforeAll(() => showPage());

describe("the page", () => {
  it("shows the latest Month-End Snapshot's Net Worth", () => {
    expect(document.querySelector(".latest")!.textContent).toBe("£39,789.80");
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
      ["Holidays (TRAVEL COVER)", "Yearly", "£89.00", "3 Mar 2026", "Current", "£89.00"],
      ["Streaming (PHOTO CLOUD)", "Yearly", "£59.99", "8 Jul 2026", "Current", "£59.99"],
      ["Groceries (VEG BOX)", "Weekly", "£18.50", "23 Feb 2026", "Lapsed", "£962.00"],
      ["Streaming (MUSICBOX)", "Monthly", "£9.99", "20 Mar 2026", "Lapsed", "£119.88"],
      ["Total yearly cost of current Subscriptions", "", "", "", "", "£15,280.87"],
    ]);
  });

  it("says some Subscriptions are found from repeating charges and some declared on rules", () => {
    const explanation = document.querySelector(".subscriptions .muted")!.textContent!;
    expect(explanation).toContain("found from repeating charges");
    expect(explanation).toContain("declared on their rules");
  });

  it("keeps a declared Subscription's Transactions in their own Category in the Spending breakdown", () => {
    const [spending] = document.querySelectorAll("table.months");
    expect(rows(spending!).find(([label]) => label === "Holidays")!.slice(1, 6)).toEqual(["£0.00", "£0.00", "£89.00", "£0.00", "£1,480.00"]);
  });

  it("explains that Current is judged against how far its Account's Statements reach, not today", () => {
    expect(document.querySelector(".subscriptions .muted")!.textContent).toContain(
      "Current means its next charge, plus 7 days, isn't due until after the latest Transaction on its Account's Statements, so Statements a few weeks behind today don't make it Lapsed.",
    );
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

describe("What changed", () => {
  const section = () => document.querySelector(".what-changed")!;
  /** Selects a month by its column heading in the Spending table. */
  const select = (month: string) =>
    [...document.querySelectorAll<HTMLButtonElement>("table.months th button")].find((b) => b.textContent === month)!.click();
  /** Each group of changes, as its heading and its table's rows. */
  const groups = () => [...section().querySelectorAll(".changes")].map((g) => [g.querySelector("h3")!.textContent, rows(g.querySelector("table")!)]);

  afterAll(() => select("Jun 26"));

  it("groups the changes by what they mean, each largest first, with the month's amount and the usual amount and no signs", () => {
    select("Apr 26");
    expect(groups()).toEqual([
      ["Spent more on", [["Subcategory", "Change", "Apr 26", "Usual"], ["Food › Eating Out", "£125.00", "£183.00", "£58.00"]]],
      ["Spent less on", [
        ["Subcategory", "Change", "Apr 26", "Usual"],
        ["Home › Energy", "£45.00", "£80.00", "£125.00"],
        ["Food › Groceries", "£40.33", "£280.00", "£320.33"],
        ["Fun › Holidays", "£29.67", "£0.00", "£29.67"],
        ["Uncategorised", "£13.33", "£9.00", "£22.33"],
        ["Fun › Streaming", "£9.99", "£10.99", "£20.98"],
      ]],
      ["Earned more from", [["Subcategory", "Change", "Apr 26", "Usual"], ["Savings › Interest", "£2.40", "£29.80", "£27.40"]]],
      ["Earned less from", [["Subcategory", "Change", "Apr 26", "Usual"], ["Uncategorised", "£15.00", "£0.00", "£15.00"]]],
    ]);
  });

  it("leaves out a group with no changes", () => {
    select("Mar 26");
    expect(groups().map(([heading]) => heading)).toEqual(["Spent more on", "Spent less on", "Earned more from"]);
  });

  it("states the comparison once, and keeps the Largest Spending Transactions below", () => {
    select("Apr 26");
    const notes = [...section().querySelectorAll(".muted")].map((note) => note.textContent);
    expect(notes).toEqual(["Against the average of Jan 26, Feb 26, Mar 26. Click a figure to see its Transactions."]);
    expect([...section().querySelectorAll("h3")].at(-1)!.textContent).toBe("Largest Spending Transactions");
    expect(rows(section().querySelector(".changes ~ .scroll table")!)[1]).toEqual(["1 Apr 2026", "Current Account", "DD LANDLORD RENT", "£1,250.00"]);
  });

  it("lists a change's Transactions when it is clicked", () => {
    select("Apr 26");
    section().querySelector<HTMLButtonElement>(".changes button.cell")!.click();
    const listed = rows(section().querySelector(".transactions table")!).slice(1);
    expect(listed.map(([date, , description, amount]) => [date, description, amount])).toEqual([
      ["6 Apr 2026", "CORNER CAFE", "£27.00"],
      ["9 Apr 2026", "CORNER CAFE", "£36.00"],
      ["13 Apr 2026", "CORNER CAFE", "£33.00"],
      ["17 Apr 2026", "CORNER CAFE", "£30.00"],
      ["21 Apr 2026", "CORNER CAFE", "£27.00"],
      ["27 Apr 2026", "CORNER CAFE", "£30.00"],
    ]);
  });

  it("says a month not yet over, and Tracking Start, aren't compared", () => {
    select("Jul 26 so far");
    expect(section().querySelector(".muted")!.textContent).toBe("Jul 26 isn't over yet, so it isn't compared with earlier months.");
    select("Jan 26");
    expect(section().querySelector(".muted")!.textContent).toBe("Jan 26 is Tracking Start, so there's no earlier month to compare it with.");
    expect(groups()).toEqual([]);
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

  it("refuses a new Category named Subscriptions, in any case or with surrounding spaces, before saving", async () => {
    await showPage();
    const form = makeRule("MYSTERY MERCHANT LTD");
    choose(form, "New Category…");
    type(field(form, "category"), "  subscriptions ");
    type(field(form, "subcategory"), "Streaming");
    save(form);
    await vi.waitFor(() => expect(form.querySelector(".error")!.textContent).toBe(SUBSCRIPTIONS_REFUSAL));
    expect(fetched).not.toContain("/rules");
  });
});

const SUBSCRIPTIONS_REFUSAL =
  'Subscriptions is a view across Categories, not a Category, so the rule wasn\'t saved. Sort it into a Category for what it is for, and tick "This is a Subscription" instead.';

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

});

describe("asking Claude for Suggested Rules", () => {
  /** Every request the made-up Claude was sent. */
  const asked: SuggestionRequest[] = [];
  const recordingClaude = async (request: SuggestionRequest) => {
    asked.push(request);
    return madeUpClaude(request);
  };
  const tickboxes = () => [...suggest().querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
  const suggestedRows = () => rows(suggest().querySelector(".suggested table")!).slice(1).map((row) => row.slice(0, 3));
  const suggestedButton = (contains: string, label: string) => {
    const row = [...suggest().querySelectorAll(".suggested tr")].find((r) => r.querySelector("td")?.textContent === contains)!;
    return [...row.querySelectorAll("button")].find((b) => b.textContent === label)!;
  };
  const askClaude = async () => {
    suggestButton().click();
    await vi.waitFor(() => expect(suggest().querySelector(".suggested table")).not.toBeNull());
  };
  const uncategorisedDescriptions = () => [...document.querySelectorAll(".uncategorised-list td.description")].map((cell) => cell.textContent);

  beforeAll(async () => {
    asked.length = 0;
    await showPage({ claude: recordingClaude });
  });

  it("sends nothing until Suggest rules is pressed, then asks once with only the ticked rows, masked, and the Categories", async () => {
    expect(asked).toEqual([]);
    tickboxes()[2]!.click();
    await askClaude();
    expect(fetched.filter((url) => url === "/suggestions")).toHaveLength(1);
    expect(asked).toEqual([
      {
        descriptions: [
          { description: "MYSTERY MERCHANT LTD", direction: "Out" },
          { description: "PAYMENT FROM A FRIEND", direction: "In" },
        ],
        categories: [
          { name: "Home", kind: "Spending", subcategories: ["Rent", "Energy"] },
          { name: "Food", kind: "Spending", subcategories: ["Groceries", "Eating Out"] },
          { name: "Fun", kind: "Spending", subcategories: ["Streaming", "Holidays"] },
          { name: "Work", kind: "Earnings", subcategories: ["Salary"] },
          { name: "Savings", kind: "Earnings", subcategories: ["Interest"] },
        ],
      },
    ]);
  });

  it("shows Suggested Rules using existing Subcategories, Transfer or a Category marked as new, each with how many Uncategorised descriptions it catches and their total", async () => {
    await showPage({ claude: recordingClaude });
    await askClaude();
    // The made-up response also has masked "contains" text, which isn't shown.
    expect(suggestedRows()).toEqual([
      ["MYSTERY MERCHANT", "Fun › Holidays", "Catches 1 Uncategorised description: £196.00 Spending."],
      ["FRIEND", "Transfer", "Catches 1 Uncategorised description: £45.00 Earnings."],
      ["CITY PARKING", "Transport › Parking (new Spending Category)", "Catches 2 Uncategorised descriptions: £9.00 Spending."],
    ]);
    expect(suggest().textContent).not.toMatch(/approve all/i);
  });

  it("discards a rejected Suggested Rule, saving and asking nothing", () => {
    const before = fetched.length;
    suggestedButton("FRIEND", "Reject").click();
    expect(suggestedRows().map(([contains]) => contains)).toEqual(["MYSTERY MERCHANT", "CITY PARKING"]);
    expect(fetched.length).toBe(before);
  });

  it("saves an approved Suggested Rule like a hand-made one, then fetches the Report again", async () => {
    await showPage({ claude: recordingClaude });
    await askClaude();
    suggestedButton("MYSTERY MERCHANT", "Approve").click();
    await vi.waitFor(() => expect(uncategorisedDescriptions()).toEqual(["PAYMENT FROM A FRIEND", "CITY PARKING 20417", "CITY PARKING 20988"]));
    expect(fetched.slice(-2)).toEqual(["/rules", "/report"]);
    expect(suggestedRows().map(([contains]) => contains)).toEqual(["FRIEND", "CITY PARKING"]);
  });

  it("opens a Suggested Rule in the rule form to edit it before approving it", async () => {
    suggestedButton("FRIEND", "Edit").click();
    const form = suggest().querySelector<HTMLFormElement>("form.rule")!;
    const contains = form.querySelector<HTMLInputElement>('input[name="contains"]')!;
    const then = form.querySelector<HTMLSelectElement>('select[name="then"]')!;
    expect(contains.value).toBe("FRIEND");
    expect(then.selectedOptions[0]!.textContent).toBe("Transfer");
    then.value = [...then.options].find((option) => option.textContent === "Work › Salary")!.value;
    contains.value = "PAYMENT FROM";
    form.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    await vi.waitFor(() => expect(uncategorisedDescriptions()).toEqual(["CITY PARKING 20417", "CITY PARKING 20988"]));
    const [, earnings] = document.querySelectorAll("table.months");
    expect(rows(earnings!).find(([label]) => label === "Salary")![3]).toBe("£3,145.00");
    expect(suggestedRows().map(([contains]) => contains)).toEqual(["CITY PARKING"]);
  });

  const spendingLabels = () => rows(document.querySelectorAll("table.months")[0]!).map(([label]) => label);
  const formField = <E extends HTMLInputElement | HTMLSelectElement>(form: HTMLFormElement, name: string) => form.querySelector<E>(`[name="${name}"]`)!;

  it("adds nothing when a Suggested Rule with a new Category is rejected", async () => {
    await showPage({ claude: recordingClaude });
    await askClaude();
    const before = fetched.length;
    suggestedButton("CITY PARKING", "Reject").click();
    expect(suggestedRows().map(([contains]) => contains)).toEqual(["MYSTERY MERCHANT", "FRIEND"]);
    expect(fetched.length).toBe(before);
    expect(spendingLabels()).not.toContain("Transport");
  });

  it("saves an approved Suggested Rule's new Category, as its kind, along with the rule", async () => {
    await showPage({ claude: recordingClaude });
    await askClaude();
    suggestedButton("CITY PARKING", "Approve").click();
    await vi.waitFor(() => expect(uncategorisedDescriptions()).toEqual(["MYSTERY MERCHANT LTD", "PAYMENT FROM A FRIEND"]));
    expect(spendingLabels()).toEqual(expect.arrayContaining(["Transport", "Parking"]));
  });

  it("refuses approving a Suggested Rule whose new Category is named Subscriptions, saving nothing", async () => {
    await showPage({ claude: async () => JSON.stringify({ suggestions: [{ contains: "MYSTERY", transfer: false, category: "Subscriptions", subcategory: "Gadgets" }] }) });
    await askClaude();
    suggestedButton("MYSTERY", "Approve").click();
    await vi.waitFor(() => expect(suggest().querySelector(".suggested .error")!.textContent).toBe(SUBSCRIPTIONS_REFUSAL));
    expect(fetched).not.toContain("/rules");
    expect(uncategorisedDescriptions()).toContain("MYSTERY MERCHANT LTD");
    expect(spendingLabels()).not.toContain("Subscriptions");
  });

  it("opens a Suggested Rule's new Category in the rule form, to rename or change it before approving it", async () => {
    await showPage({ claude: recordingClaude });
    await askClaude();
    suggestedButton("CITY PARKING", "Edit").click();
    const form = suggest().querySelector<HTMLFormElement>("form.rule")!;
    const field = <E extends HTMLInputElement | HTMLSelectElement>(name: string) => formField<E>(form, name);
    expect(field<HTMLSelectElement>("then").selectedOptions[0]!.textContent).toBe("New Category…");
    expect(field("category").value).toBe("Transport");
    expect(field("kind").value).toBe("Spending");
    expect(field("subcategory").value).toBe("Parking");
    expect(field("category").closest("label")!.hidden).toBe(false);
    field("category").value = "Getting About";
    form.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    await vi.waitFor(() => expect(uncategorisedDescriptions()).toEqual(["MYSTERY MERCHANT LTD", "PAYMENT FROM A FRIEND"]));
    expect(spendingLabels()).toContain("Getting About");
    expect(spendingLabels()).not.toContain("Transport");
  });

  it("stops marking a Category as new once an earlier Suggested Rule naming it is approved", async () => {
    await showPage({
      claude: async () =>
        JSON.stringify({
          suggestions: [
            { contains: "CITY PARKING 20417", transfer: false, category: "Transport", subcategory: "Parking" },
            { contains: "CITY PARKING 20988", transfer: false, category: "Transport", subcategory: "Parking" },
            { contains: "MYSTERY", transfer: false, category: "Transport", subcategory: "Taxis" },
          ],
        }),
    });
    await askClaude();
    suggestedButton("CITY PARKING 20417", "Approve").click();
    await vi.waitFor(() => expect(uncategorisedDescriptions()).toEqual(["MYSTERY MERCHANT LTD", "PAYMENT FROM A FRIEND", "CITY PARKING 20988"]));
    expect(suggestedRows().map(([contains, sortInto]) => [contains, sortInto])).toEqual([
      ["CITY PARKING 20988", "Transport › Parking"],
      ["MYSTERY", "Transport › Taxis (new Subcategory)"],
    ]);
    suggestedButton("MYSTERY", "Approve").click();
    await vi.waitFor(() => expect(uncategorisedDescriptions()).toEqual(["PAYMENT FROM A FRIEND", "CITY PARKING 20988"]));
    expect(spendingLabels()).toContain("Taxis");
  });

  it("opens a Suggested Rule's new Subcategory in the rule form under its existing Category", async () => {
    await showPage({ claude: async () => JSON.stringify({ suggestions: [{ contains: "MYSTERY", transfer: false, category: "Fun", subcategory: "Gadgets" }] }) });
    await askClaude();
    expect(suggestedRows()).toEqual([["MYSTERY", "Fun › Gadgets (new Subcategory)", "Catches 1 Uncategorised description: £196.00 Spending."]]);
    suggestedButton("MYSTERY", "Edit").click();
    const form = suggest().querySelector<HTMLFormElement>("form.rule")!;
    const field = <E extends HTMLInputElement | HTMLSelectElement>(name: string) => formField<E>(form, name);
    expect(field<HTMLSelectElement>("then").selectedOptions[0]!.textContent).toBe("New Subcategory…");
    expect(field("parent").value).toBe("Fun");
    expect(field("subcategory").value).toBe("Gadgets");
    form.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    await vi.waitFor(() => expect(spendingLabels()).toContain("Gadgets"));
  });

  it("shows a clear error and changes nothing when asking Claude fails", async () => {
    await showPage({ claude: recordingClaude });
    await askClaude();
    const failing = async () => {
      throw new Error("Claude couldn't be reached, so nothing was suggested. Check your internet connection and try again.");
    };
    await showPage({ claude: failing });
    suggestButton().click();
    await vi.waitFor(() =>
      expect(suggest().querySelector(".error")!.textContent).toBe("Claude couldn't be reached, so nothing was suggested. Check your internet connection and try again."),
    );
    expect(suggest().querySelector(".suggested table")).toBeNull();
    expect(fetched).toEqual(["/report", "/suggestions"]);
  });

  it("shows a clear error when Claude's response can't be read", async () => {
    await showPage({ claude: async () => "Sorry, here are some ideas" });
    suggestButton().click();
    await vi.waitFor(() =>
      expect(suggest().querySelector(".error")!.textContent).toBe("Claude's response couldn't be read as Suggested Rules, so nothing was suggested. Try again."),
    );
    expect(suggest().querySelector(".suggested table")).toBeNull();
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

describe("making a rule with no rules file yet", () => {
  beforeAll(() => showPage({ rulesFile: false }));

  const makeRule = (description: string) => {
    const row = [...document.querySelectorAll(".uncategorised-list tr")].find((r) => r.querySelector("td.description")?.textContent === description)!;
    [...row.querySelectorAll("button")].find((b) => b.textContent === "Make rule")!.click();
    return document.querySelector<HTMLFormElement>("form.rule")!;
  };
  const field = <E extends HTMLInputElement | HTMLSelectElement>(form: HTMLFormElement, name: string) => form.querySelector<E>(`[name="${name}"]`)!;
  const type = (input: HTMLInputElement, text: string) => {
    input.value = text;
    input.dispatchEvent(new Event("input"));
  };
  const chooseNewCategory = (form: HTMLFormElement) => {
    const select = field<HTMLSelectElement>(form, "then");
    select.value = [...select.options].find((option) => option.textContent === "New Category…")!.value;
    select.dispatchEvent(new Event("change"));
  };
  const labels = (table: Element) => rows(table).map(([label]) => label);

  it("offers only Transfer or a new Category, and saving one creates the rules file holding it and the rule", async () => {
    expect(document.body.textContent).toContain("No rules file yet");
    const form = makeRule("MYSTERY MERCHANT LTD");
    expect([...field<HTMLSelectElement>(form, "then").options].filter((option) => !option.disabled).map((option) => option.textContent)).toEqual([
      "Transfer",
      "New Category…",
    ]);
    chooseNewCategory(form);
    type(field(form, "category"), "Shopping");
    type(field(form, "subcategory"), "Online");
    form.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    await vi.waitFor(() => expect(document.body.textContent).not.toContain("No rules file yet"));
    const [spending] = document.querySelectorAll("table.months");
    expect(labels(spending!)).toContain("Shopping");
  });

  it("saves a new Category as the kind chosen, not the one it started as", async () => {
    const form = makeRule("PAYMENT FROM A FRIEND");
    chooseNewCategory(form);
    const kind = field<HTMLSelectElement>(form, "kind");
    expect(kind.value).toBe("Earnings");
    kind.value = "Spending";
    type(field(form, "category"), "Gifts");
    type(field(form, "subcategory"), "From Friends");
    form.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    await vi.waitFor(() => expect(labels(document.querySelectorAll("table.months")[0]!)).toContain("Gifts"));
    expect(labels(document.querySelectorAll("table.months")[1]!)).not.toContain("Gifts");
  });
});

describe("the page when the Report can't be built", () => {
  beforeAll(() => showPage({ ...madeUpTracker(), report: () => Promise.reject(new Error("No Closing Balance found")) }));

  it("shows why in place of the chart", () => {
    const error = document.querySelector("#content .error")!;
    expect(error.querySelector("h2")!.textContent).toBe("Net Worth can't be shown");
    expect(error.textContent).toContain("No Closing Balance found");
    expect(document.querySelector(".latest")).toBeNull();
  });
});
