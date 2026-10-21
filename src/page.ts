import type { AccountBalance, MonthEndSnapshot } from "./netWorth.js";
import type { Category, CategoryKind } from "./rules.js";
import type { Report, ReportResponse } from "./server.js";
import type { Breakdown, SpendingMonth, Transaction, UncategorisedDescription } from "./spending.js";
import type { Direction, IsoDate, Pence } from "./statements.js";

const gbp = (pence: Pence) => (pence / 100).toLocaleString("en-GB", { style: "currency", currency: "GBP" });
const dayLabel = (iso: IsoDate) => new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const monthLabel = (iso: IsoDate) => new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { month: "short", year: "2-digit" });

type Attributes = Record<string, string | number>;

function el<Tag extends keyof HTMLElementTagNameMap>(tag: Tag, attrs: Attributes = {}, text?: string): HTMLElementTagNameMap[Tag] {
  return withAttributes(document.createElement(tag), attrs, text);
}

function svgEl<Tag extends keyof SVGElementTagNameMap>(tag: Tag, attrs: Attributes = {}, text?: string): SVGElementTagNameMap[Tag] {
  return withAttributes(document.createElementNS("http://www.w3.org/2000/svg", tag), attrs, text);
}

function withAttributes<E extends Element>(node: E, attrs: Attributes, text: string | undefined): E {
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  if (text !== undefined) node.textContent = text;
  return node;
}

const SERIES: { key: "netWorth" | "assets" | "liabilities"; label: string }[] = [
  { key: "netWorth", label: "Net Worth" },
  { key: "assets", label: "Total Assets" },
  { key: "liabilities", label: "Total Liabilities" },
];

/** A legend from [className, label] pairs, as lines or, for bars, as swatches. */
function legend(entries: [className: string, label: string][], swatches = false) {
  const node = el("div", { class: swatches ? "legend swatches" : "legend" });
  for (const [className, label] of entries) node.append(el("span", { class: className }, label));
  return node;
}

/**
 * The selected month, shared by both charts and both tables. Each registers a function showing the selection, so
 * selecting a month in any of them shows it in all of them.
 */
const monthSelection = {
  selected: undefined as IsoDate | undefined,
  shows: [] as ((monthEnd: IsoDate | undefined) => void)[],
  /** Calls `show` with the selected month end now, and again whenever another month is selected. */
  follow(show: (monthEnd: IsoDate | undefined) => void) {
    this.shows.push(show);
    show(this.selected);
  },
  select(monthEnd: IsoDate | undefined) {
    this.selected = monthEnd;
    for (const show of this.shows) show(monthEnd);
  },
};

// Both charts share one month axis, each month a band of equal width, so a month's bar sits under its Net Worth point.
const CHART_WIDTH = 900, CHART_LEFT = 80, CHART_RIGHT = 20;
const monthBand = (count: number) => (CHART_WIDTH - CHART_LEFT - CHART_RIGHT) / count;
const monthX = (count: number) => (i: number) => CHART_LEFT + (i + 0.5) * monthBand(count);

/** Gridlines labelled in GBP from zero or the lowest figure to the highest, returning the vertical scale. */
function valueAxis(svg: SVGSVGElement, pence: Pence[], top: number, bottom: number): (pence: Pence) => number {
  let min = Math.min(0, ...pence), max = Math.max(...pence);
  if (max === min) max = min + 100;
  const step = niceStep((max - min) / 5);
  min = Math.floor(min / step) * step; max = Math.ceil(max / step) * step;
  const y = (v: Pence) => top + ((max - v) * (bottom - top)) / (max - min);
  for (let v = min; v <= max; v += step) {
    svg.append(svgEl("line", { class: "grid", x1: CHART_LEFT, x2: CHART_WIDTH - CHART_RIGHT, y1: y(v), y2: y(v) }));
    svg.append(svgEl("text", { x: CHART_LEFT - 8, y: y(v) + 4, "text-anchor": "end" }, gbp(v)));
  }
  return y;
}

/** Month labels along the bottom of a chart, with "so far" under the current month. */
function monthLabels(svg: SVGSVGElement, months: SpendingMonth[], height: number) {
  const x = monthX(months.length);
  months.forEach((month, i) => {
    const label = svgEl("text", { x: x(i), y: height - 22, "text-anchor": "middle" }, monthLabel(month.monthEnd));
    if (month.partial) label.append(svgEl("tspan", { x: x(i), dy: 14 }, "so far"));
    svg.append(label);
  });
}

/**
 * Shades the selected month's band on a chart, and selects the month whose band is clicked. Called before the chart
 * draws its marks, so the shading sits behind them.
 */
function selectableMonths(svg: SVGSVGElement, months: SpendingMonth[], top: number, bottom: number) {
  const x = monthX(months.length), band = monthBand(months.length);
  const shades = months.map((_, i) => svgEl("rect", { class: "month-band", x: x(i) - band / 2, y: top, width: band, height: bottom - top }));
  svg.append(...shades);
  svg.classList.add("months");
  svg.addEventListener("click", (event) => {
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(svg.getScreenCTM()!.inverse());
    const i = Math.floor((point.x - CHART_LEFT) / band);
    if (i >= 0 && i < months.length) monthSelection.select(months[i]!.monthEnd);
  });
  monthSelection.follow((selected) =>
    months.forEach((month, i) => shades[i]!.setAttribute("visibility", month.monthEnd === selected ? "visible" : "hidden")),
  );
}

function chart(snapshots: MonthEndSnapshot[], months: SpendingMonth[]) {
  const height = 360, top = 10, bottom = height - 40;
  const svg = svgEl("svg", { viewBox: `0 0 ${CHART_WIDTH} ${height}`, role: "img", "aria-label": "Net Worth, total Assets and total Liabilities at each month end" });
  selectableMonths(svg, months, top, bottom);
  const y = valueAxis(svg, snapshots.flatMap((s) => SERIES.map(({ key }) => s[key])), top, bottom);
  monthLabels(svg, months, height);
  const x = monthX(snapshots.length);
  // Drawn in reverse so the Net Worth line sits on top.
  for (const { key, label } of [...SERIES].reverse()) {
    svg.append(svgEl("polyline", { class: key, points: snapshots.map((s, i) => `${x(i)},${y(s[key])}`).join(" ") }));
    snapshots.forEach((s, i) => {
      const dot = svgEl("circle", { class: key, cx: x(i), cy: y(s[key]), r: key === "netWorth" ? 4 : 3 });
      dot.append(svgEl("title", {}, `${label}, ${monthLabel(s.monthEnd)}: ${gbp(s[key])}`));
      svg.append(dot);
    });
  }
  return svg;
}

function niceStep(raw: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 5, 10].map((m) => m * magnitude).find((s) => s >= raw)!;
}

/** Spending per month as one bar stacked by Spending Category, then Uncategorised, on the Net Worth chart's month axis. */
function spendingChart(months: SpendingMonth[], categories: Category[]) {
  type Series = { className: string; label: string; pence: (m: SpendingMonth) => Pence };
  const series: Series[] = [
    ...categories
      .filter((category) => category.kind === "Spending")
      .map((category, i): Series => ({ className: `category-${i % 8}`, label: category.name, pence: (m) => m.spending.categories[i]!.total })),
    { className: "uncategorised", label: "Uncategorised", pence: (m) => m.spending.uncategorised },
  ];
  // A Category whose Refunds outweigh its Spending in a month stacks below zero.
  const stacks = months.map((month) => {
    let up = 0, down = 0;
    return series.map(({ pence }) => {
      const p = pence(month);
      if (p >= 0) return { pence: p, low: up, high: (up += p) };
      return { pence: p, low: (down += p), high: down - p };
    });
  });
  const height = 260, top = 10, bottom = height - 40;
  const svg = svgEl("svg", { viewBox: `0 0 ${CHART_WIDTH} ${height}`, role: "img", "aria-label": "Spending by Category in each month" });
  selectableMonths(svg, months, top, bottom);
  const y = valueAxis(svg, stacks.flat().flatMap(({ low, high }) => [low, high]), top, bottom);
  monthLabels(svg, months, height);
  const x = monthX(months.length), barWidth = monthBand(months.length) * 0.6;
  months.forEach((month, i) =>
    stacks[i]!.forEach(({ pence, low, high }, j) => {
      if (pence === 0) return;
      const { className, label } = series[j]!;
      const segment = svgEl("rect", {
        class: `segment ${className}${month.partial ? " partial" : ""}`,
        x: x(i) - barWidth / 2, y: y(high), width: barWidth, height: y(low) - y(high),
      });
      segment.append(svgEl("title", {}, `${label}, ${monthHeading(month)}: ${gbp(pence)}`));
      svg.append(segment);
    }),
  );
  const section = el("div");
  section.append(el("h2", {}, "Spending by month"), legend(series.map(({ className, label }) => [className, label]), true), svg);
  return section;
}

/** A table's header row, from [label, className] pairs. */
function headerRow(columns: [label: string, className?: string][]) {
  const head = el("tr");
  for (const [label, className] of columns) head.append(el("th", className ? { class: className } : {}, label));
  return head;
}

function accountTable(accounts: AccountBalance[]) {
  const table = el("table");
  table.append(headerRow([["Account"], ["Kind"], ["Latest Balance", "balance"], ["Dated"]]));
  for (const { account, kind, pence, date, stale } of accounts) {
    const dated = el("td", {}, dayLabel(date));
    if (stale) dated.append(el("span", { class: "stale", title: "Latest Balance is more than 2 months old. It still counts in Net Worth." }, "Stale"));
    const row = el("tr");
    row.append(el("td", {}, account), el("td", {}, kind), el("td", { class: "balance" }, gbp(pence)), dated);
    table.append(row);
  }
  return table;
}

const monthHeading = (month: SpendingMonth) => (month.partial ? `${monthLabel(month.monthEnd)} so far` : monthLabel(month.monthEnd));

/**
 * The Transactions behind a figure: date, Account, description and amount. Amounts moving the figure the other way,
 * such as a Refund under Spending, show as negative.
 */
function transactionList(title: string, transactions: Transaction[], adds: Direction) {
  const panel = el("div", { class: "transactions" });
  panel.append(el("h3", {}, title));
  if (transactions.length === 0) {
    panel.append(el("div", { class: "muted" }, "No Transactions."));
    return panel;
  }
  const table = el("table");
  table.append(headerRow([["Date"], ["Account"], ["Description"], ["Amount", "balance"]]));
  const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date));
  for (const { date, account, description, pence, direction } of sorted) {
    const row = el("tr");
    row.append(
      el("td", {}, dayLabel(date)),
      el("td", {}, account),
      el("td", { class: "description" }, description),
      el("td", { class: "balance" }, gbp(direction === adds ? pence : -pence)),
    );
    table.append(row);
  }
  panel.append(table);
  return panel;
}

/** A figure that lists its Transactions below `panel` when clicked, and hides them when clicked again. */
function figureButton(text: string, title: string, transactions: Transaction[], adds: Direction, panel: HTMLElement) {
  const button = el("button", { class: "cell", type: "button", "aria-pressed": "false" }, text);
  button.addEventListener("click", () => {
    const opening = button.getAttribute("aria-pressed") !== "true";
    for (const other of document.querySelectorAll('button.cell[aria-pressed="true"]')) other.setAttribute("aria-pressed", "false");
    for (const other of document.querySelectorAll(".transactions-panel")) other.replaceChildren();
    if (!opening) return;
    button.setAttribute("aria-pressed", "true");
    panel.replaceChildren(transactionList(title, transactions, adds));
  });
  return button;
}

/**
 * A table with months across the top and one row per figure. A row with subrows expands to show them. Clicking a
 * figure from a row with Transactions lists them below the table, `adds` being the direction that adds to the figure.
 */
/** One row of a month table: its figure and the Transactions behind it in each month, and any subrows. */
type FigureRow = {
  label: string;
  pence: (m: SpendingMonth) => Pence;
  transactions?: (m: SpendingMonth) => Transaction[];
  className?: string;
  subrows?: FigureRow[];
};

function monthTable(heading: string, months: SpendingMonth[], rows: FigureRow[], adds: Direction) {
  const panel = el("div", { class: "transactions-panel" });
  const table = el("table", { class: "months" });
  // Each month's cells, its header first, so the selected month's column can be shaded.
  const columns = months.map((): HTMLElement[] => []);
  const monthButtons = months.map((month) => {
    const button = el("button", { class: "month", type: "button", "aria-pressed": "false" }, monthHeading(month));
    button.addEventListener("click", () => monthSelection.select(month.monthEnd));
    return button;
  });
  const head = el("tr");
  head.append(el("th", {}, heading));
  monthButtons.forEach((button, i) => {
    const th = el("th", { class: "balance" });
    th.append(button);
    head.append(th);
    columns[i]!.push(th);
  });
  table.append(head);
  const figureRow = ({ label, pence, transactions, className }: FigureRow, labelCell?: HTMLElement) => {
    const row = el("tr", className ? { class: className } : {});
    row.append(labelCell ?? el("td", {}, label));
    months.forEach((month, i) => {
      const cell = el("td", { class: "balance" });
      const text = gbp(pence(month));
      cell.append(transactions ? figureButton(text, `${label}, ${monthHeading(month)}: ${text}`, transactions(month), adds, panel) : text);
      cell.addEventListener("click", () => monthSelection.select(month.monthEnd));
      row.append(cell);
      columns[i]!.push(cell);
    });
    return row;
  };
  for (const figure of rows) {
    if (!figure.subrows) {
      table.append(figureRow(figure));
      continue;
    }
    const subrows = figure.subrows.map((subrow) => figureRow({ ...subrow, className: "subcategory" }));
    for (const subrow of subrows) subrow.hidden = true;
    const expand = el("button", { class: "expand", type: "button", "aria-expanded": "false" }, figure.label);
    expand.addEventListener("click", () => {
      const expanded = expand.getAttribute("aria-expanded") !== "true";
      expand.setAttribute("aria-expanded", String(expanded));
      for (const subrow of subrows) subrow.hidden = !expanded;
    });
    const labelCell = el("td");
    labelCell.append(expand);
    table.append(figureRow(figure, labelCell), ...subrows);
  }
  const scroll = el("div", { class: "scroll" });
  scroll.append(table);
  monthSelection.follow((selected) =>
    months.forEach((month, i) => {
      const isSelected = month.monthEnd === selected;
      for (const cell of columns[i]!) cell.classList.toggle("selected", isSelected);
      monthButtons[i]!.setAttribute("aria-pressed", String(isSelected));
      // After layout, since on the first render the table is not on the page yet.
      if (isSelected) requestAnimationFrame(() => revealColumn(scroll, columns[i]![0]!));
    }),
  );
  const section = el("div");
  section.append(scroll, panel);
  return section;
}

/** Scrolls a table sideways just enough to show a column, clear of the sticky first column. */
function revealColumn(scroll: HTMLElement, th: HTMLElement) {
  const sticky = (th.parentElement!.firstElementChild as HTMLElement).offsetWidth;
  if (th.offsetLeft < scroll.scrollLeft + sticky) scroll.scrollLeft = th.offsetLeft - sticky;
  else if (th.offsetLeft + th.offsetWidth > scroll.scrollLeft + scroll.clientWidth) scroll.scrollLeft = th.offsetLeft + th.offsetWidth - scroll.clientWidth;
}

/** A table that scrolls sideways when it is wider than the page. */
function scrolling(table: HTMLTableElement) {
  const scroll = el("div", { class: "scroll" });
  scroll.append(table);
  return scroll;
}

/** How many of a month's changes "What changed" shows, largest first. */
const SHOWN_CHANGES = 8;

const signed = (pence: Pence) => (pence > 0 ? `+${gbp(pence)}` : pence < 0 ? `−${gbp(-pence)}` : gbp(0));

/**
 * "What changed" in the selected month: the Subcategories that moved most against the months before it, and its
 * largest Spending Transactions, each line listing its Transactions when clicked.
 */
function whatChangedPanel(months: SpendingMonth[]) {
  return monthPanel(months, "What changed", (month) => monthLabel(month.monthEnd), (month, body) => {
    if (month.partial) {
      body.append(el("div", { class: "muted" }, `${monthLabel(month.monthEnd)} isn't over yet, so it isn't compared with earlier months.`));
      return;
    }
    if (!month.whatChanged) {
      body.append(el("div", { class: "muted" }, `${monthLabel(month.monthEnd)} is Tracking Start, so there's no earlier month to compare it with.`));
      return;
    }
    const { comparedWith, changes, largest } = month.whatChanged;
    const panel = el("div", { class: "transactions-panel" });
    body.append(el("div", { class: "muted" }, `Against the average of ${comparedWith.map(monthLabel).join(", ")}. Click a figure to see its Transactions.`));
    const moved = changes.filter((c) => c.change !== 0).slice(0, SHOWN_CHANGES);
    if (moved.length === 0) body.append(el("div", { class: "muted" }, "No Subcategory changed."));
    else {
      const table = el("table");
      // The change sits next to its name, so it stays in view at phone width. Spending is the usual case, so only Earnings is labelled.
      table.append(headerRow([["Subcategory"], ["Change", "balance"], [monthLabel(month.monthEnd), "balance"], ["Average", "balance"]]));
      for (const { kind, category, subcategory, pence, average, change, transactions } of moved) {
        const name = `${category ? `${category} › ${subcategory}` : subcategory}${kind === "Earnings" ? " (Earnings)" : ""}`;
        const changeCell = el("td", { class: "balance" });
        changeCell.append(figureButton(signed(change), `${name}, ${monthLabel(month.monthEnd)}: ${gbp(pence)}`, transactions, kind === "Spending" ? "Out" : "In", panel));
        const row = el("tr");
        row.append(el("td", {}, name), changeCell, el("td", { class: "balance" }, gbp(pence)), el("td", { class: "balance" }, gbp(average)));
        table.append(row);
      }
      body.append(scrolling(table));
    }
    if (largest.length > 0) {
      const table = el("table");
      table.append(headerRow([["Date"], ["Account"], ["Description"], ["Amount", "balance"]]));
      for (const transaction of largest) {
        const amount = el("td", { class: "balance" });
        amount.append(figureButton(gbp(transaction.pence), `${transaction.description}, ${dayLabel(transaction.date)}`, [transaction], "Out", panel));
        const row = el("tr");
        row.append(el("td", {}, dayLabel(transaction.date)), el("td", {}, transaction.account), el("td", { class: "description" }, transaction.description), amount);
        table.append(row);
      }
      body.append(el("h3", {}, "Largest Spending Transactions"), scrolling(table));
    }
    body.append(panel);
  }, "what-changed");
}

/**
 * A heading and body following the selected month: the heading names the month, and `show` fills the body for it.
 */
function monthPanel(
  months: SpendingMonth[],
  title: string,
  label: (month: SpendingMonth) => string,
  show: (month: SpendingMonth, body: HTMLElement) => void,
  className?: string,
) {
  const section = el("div", className ? { class: className } : {});
  const body = el("div");
  const heading = el("h2");
  section.append(heading, body);
  monthSelection.follow((selected) => {
    const month = months.find((m) => m.monthEnd === selected);
    body.replaceChildren();
    heading.textContent = month ? `${title} in ${label(month)}` : title;
    if (month) show(month, body);
  });
  return section;
}

/** The selected month's change in Net Worth, as Earnings − Spending plus Other Change. */
function netWorthChangePanel(months: SpendingMonth[]) {
  return monthPanel(months, "Change in Net Worth", monthHeading, (month, body) => {
    if (!month.netWorthChange) {
      body.append(el("div", { class: "muted" }, `${monthLabel(month.monthEnd)} is Tracking Start, so there's no earlier Month-End Snapshot to change from.`));
      return;
    }
    const { since, change, net, otherChange } = month.netWorthChange;
    const table = el("table");
    const lines: [label: string, pence: Pence, className?: string][] = [
      ["Earnings − Spending", net],
      ["Other Change", otherChange],
      [`Change in Net Worth since ${monthLabel(since)} month end`, change, "total"],
    ];
    for (const [label, pence, className] of lines) {
      const row = el("tr", className ? { class: className } : {});
      row.append(el("td", {}, label), el("td", { class: "balance" }, signed(pence)));
      table.append(row);
    }
    body.append(
      table,
      el("div", { class: "muted" }, "Other Change is what Earnings − Spending doesn't explain. It usually holds investment growth or falls, and timing between purchases and Statement dates."),
    );
  });
}

/** Every Transaction behind a month's Spending or Earnings. */
const breakdownTransactions = (breakdown: Breakdown): Transaction[] => [...breakdown.categories.flatMap((c) => c.transactions), ...breakdown.uncategorisedTransactions];

/** One row per Category of the kind, expandable into its Subcategories, then Uncategorised and the total. */
function breakdownRows(categories: Category[], kind: CategoryKind, figures: (m: SpendingMonth) => Breakdown): FigureRow[] {
  const rows = categories
    .filter((category) => category.kind === kind)
    .map((category, i): FigureRow => ({
      label: category.name,
      pence: (m) => figures(m).categories[i]!.total,
      transactions: (m) => figures(m).categories[i]!.transactions,
      subrows: category.subcategories.map((name, j) => ({
        label: name,
        pence: (m) => figures(m).categories[i]!.subcategories[j]!.pence,
        transactions: (m) => figures(m).categories[i]!.subcategories[j]!.transactions,
      })),
    }));
  return [
    ...rows,
    { label: "Uncategorised", pence: (m) => figures(m).uncategorised, transactions: (m) => figures(m).uncategorisedTransactions },
    {
      label: `Total ${kind}`,
      pence: (m) => figures(m).total,
      transactions: (m) => breakdownTransactions(figures(m)),
      className: "total",
    },
  ];
}

function rulesFileNote({ path, found }: Report["spending"]["rulesFile"]) {
  if (found) return el("div", { class: "muted" }, "Sorted into Categories by your Categorisation Rules. Money in under a Spending Category is a Refund, reducing it. Transfers count as neither Spending nor Earnings.");
  const note = el("div", { class: "muted" });
  note.append(
    "No rules file yet, so all Spending (money out) and Earnings (money in) is Uncategorised. To sort them into Categories, create ",
    el("code", {}, path),
    ' listing your Categories and Categorisation Rules, such as { "categories": [{ "name": "Food", "kind": "Spending", "subcategories": ["Groceries"] }], "rules": [{ "contains": "TESCO", "category": "Food", "subcategory": "Groceries" }, { "contains": "AMERICAN EXPRESS", "transfer": true }] }.',
  );
  return note;
}

/** Uncategorised descriptions, largest total first, each listing its Transactions when clicked. */
function uncategorisedList(uncategorised: UncategorisedDescription[]) {
  const section = el("div");
  section.append(el("h2", {}, "Uncategorised"));
  if (uncategorised.length === 0) {
    section.append(el("div", { class: "muted" }, "Every Transaction is sorted into a Category or marked as a Transfer."));
    return section;
  }
  section.append(el("div", { class: "muted" }, "Descriptions no Categorisation Rule matches, largest total first, so the next rule to write is at the top. Click a total to see its Transactions."));
  const panel = el("div", { class: "transactions-panel" });
  const table = el("table");
  table.append(headerRow([["Description"], ["Uncategorised"], ["Transactions", "balance"], ["Total", "balance"]]));
  for (const { description, direction, pence, transactions } of uncategorised) {
    const kind = direction === "Out" ? "Spending" : "Earnings";
    const total = el("td", { class: "balance" });
    total.append(figureButton(gbp(pence), `${description}, Uncategorised ${kind}: ${gbp(pence)}`, transactions, direction, panel));
    const row = el("tr");
    row.append(el("td", { class: "description" }, description), el("td", {}, kind), el("td", { class: "balance" }, String(transactions.length)), total);
    table.append(row);
  }
  section.append(table, panel);
  return section;
}

function spendingSection({ months, uncategorised, categories, rulesFile }: Report["spending"]) {
  const section = el("div");
  section.append(
    el("h2", {}, "Spending"),
    rulesFileNote(rulesFile),
    monthTable("Spending", months, breakdownRows(categories, "Spending", (m) => m.spending), "Out"),
    el("h2", {}, "Earnings"),
    monthTable("Earnings", months, [
      ...breakdownRows(categories, "Earnings", (m) => m.earnings),
      // Money in adds to Net and money out takes from it, under Spending and Earnings alike.
      {
        label: "Net (Earnings − Spending)",
        pence: (m) => m.net,
        transactions: (m) => [...breakdownTransactions(m.earnings), ...breakdownTransactions(m.spending)],
        className: "net",
      },
    ], "In"),
    uncategorisedList(uncategorised),
  );
  return section;
}

async function render() {
  const content = document.getElementById("content")!;
  const report: ReportResponse = await fetch("/report")
    .then((r) => r.json() as Promise<ReportResponse>)
    .catch(() => ({ error: "The tracker isn't responding. Is it still running? Start it with npm start, then refresh." }));
  content.replaceChildren();
  content.className = "";
  if ("error" in report) {
    // Shown in place of the chart, since a Net Worth built from partly read Statements could look right and be wrong.
    const error = el("div", { class: "error", role: "alert" });
    error.append(el("h2", {}, "Net Worth can't be shown"), el("div", {}, report.error));
    content.append(error);
    return;
  }
  const latest = report.snapshots.at(-1);
  if (latest) {
    content.append(el("div", { class: "latest" }, gbp(latest.netWorth)));
    content.append(el("div", { class: "muted" }, `${gbp(latest.assets)} in Assets less ${gbp(latest.liabilities)} in Liabilities, as of ${monthLabel(latest.monthEnd)} month end`));
  }
  // Both calculators give the same months, from Tracking Start through the current one. The latest full month starts selected.
  const { months, categories } = report.spending;
  monthSelection.select((months.findLast((month) => !month.partial) ?? months.at(-1))?.monthEnd);
  content.append(
    legend(SERIES.map(({ key, label }) => [key, label])),
    chart(report.snapshots, months),
    spendingChart(months, categories),
    netWorthChangePanel(months),
    whatChangedPanel(months),
    el("h2", {}, "Accounts"),
    accountTable(report.accounts),
    spendingSection(report.spending),
  );
}
render();
