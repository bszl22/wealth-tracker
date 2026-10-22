import type { UncategorisedDescription } from "./spending.js";
import type { Direction, Pence } from "./statements.js";

// What a Categorisation Rule means: what it matches, which rule wins, the Categories it names, and whether one can be
// added to the rules file. It imports only types, so the server can send it to the page with the types stripped.
// Reading and writing the rules file is up to rulesFile.ts.

export type CategoryKind = "Spending" | "Earnings";

export type Category = { name: string; kind: CategoryKind; subcategories: string[] };

/** How often a Subscription charges. */
export type SubscriptionInterval = "Weekly" | "Monthly" | "Yearly";

const SUBSCRIPTION_INTERVALS: readonly unknown[] = ["Weekly", "Monthly", "Yearly"] satisfies SubscriptionInterval[];

/**
 * Gives Transactions whose description contains `contains`, ignoring case, a Category and Subcategory, or marks them as
 * Transfers. A rule into a Spending Category can declare that it catches a Subscription charging at `subscription`'s
 * interval (ADR 0005).
 */
export type CategorisationRule = { contains: string } & ({ category: string; subcategory: string; subscription?: SubscriptionInterval } | { transfer: true });

export type Rules = { categories: Category[]; rules: CategorisationRule[] };

/** Whether two Category or Subcategory names are the same, ignoring case and surrounding spaces. */
export const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The rules file, at the top of the data folder. The tracker reads it, and writes it only to save a rule made on the page (ADR 0001). */
export const RULES_FILE = "rules.json";

/** Reads a rules file's contents into its Categories and its Categorisation Rules in order. With no rules file, there are none. */
export function readRules(contents: string | undefined): Rules {
  if (contents === undefined) return { categories: [], rules: [] };
  let raw: unknown;
  try {
    raw = JSON.parse(contents);
  } catch (error) {
    // Only the position passes through, since some JSON errors quote the text around it.
    const position = /\(line \d+ column \d+\)/.exec((error as Error).message)?.[0];
    throw new Error(`${RULES_FILE} is not valid JSON${position ? ` ${position}` : ""}`);
  }
  const file = (raw ?? {}) as Record<string, unknown>;
  if (!Array.isArray(file.categories) || !Array.isArray(file.rules)) {
    throw new Error(`${RULES_FILE} needs a "categories" list and a "rules" list`);
  }
  const categories: Category[] = [];
  for (const category of file.categories) {
    const checked = checkedCategory(category);
    if (categories.some((c) => sameName(c.name, checked.name))) {
      throw new Error(`${RULES_FILE} has a Category named the same as one before it: ${JSON.stringify(category)}`);
    }
    categories.push(checked);
  }
  return { categories, rules: file.rules.map((rule) => checkedRule(rule, categories)) };
}

function checkedCategory(category: unknown): Category {
  const fail = (problem: string) => new Error(`${RULES_FILE} has a Category ${problem}: ${JSON.stringify(category)}`);
  const { name, kind, subcategories } = (category ?? {}) as Record<string, unknown>;
  const isText = (text: unknown): text is string => typeof text === "string" && text !== "";
  if (!isText(name) || !Array.isArray(subcategories) || !subcategories.every(isText)) {
    throw fail('without a "name" and a "subcategories" list');
  }
  if (subcategories.some((s, i) => subcategories.findIndex((t) => sameName(s, t)) !== i)) throw fail("listing a Subcategory twice");
  if (kind !== "Spending" && kind !== "Earnings") throw fail('whose "kind" is not "Spending" or "Earnings"');
  if (isSubscriptions(name)) {
    throw fail(
      'named Subscriptions, but Subscriptions is a view across Categories, not a Category. Move its rules into Categories for what they are for, mark each as a Subscription with "subscription": "Weekly", "Monthly" or "Yearly", then remove the Category',
    );
  }
  return { name, kind, subcategories };
}

/** Whether a Category name is Subscriptions, which is a view across Categories and never a Category (ADR 0005). */
const isSubscriptions = (name: string) => sameName(name, "Subscriptions");

/**
 * Why a rule to save is refused because it adds a Category named Subscriptions, by `sameName`, or nothing when it
 * doesn't. The page checks it before saving, and saving checks it again.
 */
export function subscriptionsRefusal(rule: RuleToSave): string | undefined {
  if ("transfer" in rule || rule.adds?.new !== "Category" || !isSubscriptions(rule.category)) return undefined;
  return 'Subscriptions is a view across Categories, not a Category, so the rule wasn\'t saved. Sort it into a Category for what it is for, and tick "This is a Subscription" instead.';
}

const HOW_TO_FIX = 'Give it a Category and Subcategory, or "transfer": true';

function checkedRule(rule: unknown, categories: Category[]): CategorisationRule {
  const fail = (problem: string) => new Error(`${RULES_FILE} has a rule ${problem}: ${JSON.stringify(rule)}`);
  const { contains, category: categoryName, subcategory, transfer, subscription } = (rule ?? {}) as Record<string, unknown>;
  const notSpending = () => fail('declaring a Subscription that is not Spending. Only a rule into a Spending Category can have "subscription"');
  if (typeof contains !== "string" || contains.trim() === "") throw fail('with no "contains" text to look for');
  if (transfer === true && subscription !== undefined) throw notSpending();
  if (transfer === true) return { contains, transfer };
  if (transfer !== undefined) throw fail(`whose "transfer" is not true. ${HOW_TO_FIX}`);
  if (typeof categoryName !== "string") throw fail(`with no "category". ${HOW_TO_FIX}`);
  if (typeof subcategory !== "string") throw fail(`with no "subcategory". ${HOW_TO_FIX}`);
  const category = categories.find((c) => c.name === categoryName);
  if (!category) throw fail(`naming the unknown Category "${categoryName}"`);
  if (!category.subcategories.includes(subcategory)) {
    throw fail(`naming "${subcategory}", which is not a Subcategory of ${category.name}`);
  }
  if (subscription === undefined) return { contains, category: category.name, subcategory };
  if (category.kind !== "Spending") throw notSpending();
  if (!SUBSCRIPTION_INTERVALS.includes(subscription)) throw fail('whose "subscription" is not "Weekly", "Monthly" or "Yearly"');
  return { contains, category: category.name, subcategory, subscription: subscription as SubscriptionInterval };
}

/**
 * A Categorisation Rule to save, and what it `adds` to the rules file's Categories, if anything: a new Category of the
 * given kind holding just the rule's Subcategory, or the rule's Subcategory as a new one of its existing Category.
 */
export type RuleToSave = CategorisationRule & { adds?: { new: "Category"; kind: CategoryKind } | { new: "Subcategory" } };

/**
 * A rule sent to be saved, checked: its "contains" text as typed, its Category and Subcategory names trimmed, or marked
 * as a Transfer, and anything else left out. Fails saying what is wrong with it.
 */
export function ruleToSave(rule: unknown): RuleToSave {
  const { contains, transfer, category, subcategory, adds } = fieldsOf(rule);
  if (typeof contains !== "string" || contains.trim() === "") throw new Error('The rule has no "contains" text to look for, so it wasn\'t saved.');
  if (transfer === true) return { contains, transfer };
  if (transfer !== undefined) throw new Error('The rule\'s "transfer" can only be true, so it wasn\'t saved.');
  const trimmed = (name: unknown) => (typeof name === "string" ? name.trim() : "");
  const named = { contains, category: trimmed(category), subcategory: trimmed(subcategory) };
  const { new: adding, kind } = fieldsOf(adds);
  if (adds !== undefined) {
    if (adding !== "Category" && adding !== "Subcategory") throw new Error("The rule can only add a new Category or a new Subcategory, so it wasn't saved.");
    if (adding === "Category" && kind !== "Spending" && kind !== "Earnings") throw new Error("A new Category needs its kind, Spending or Earnings, so the rule wasn't saved.");
    if (named[adding === "Category" ? "category" : "subcategory"] === "") throw new Error(`The new ${adding} needs a name, so the rule wasn't saved.`);
  }
  if (named.category === "" || named.subcategory === "") throw new Error("The rule needs a Category and Subcategory, or to be a Transfer, so it wasn't saved.");
  if (adds === undefined) return named;
  return { ...named, adds: adding === "Category" ? { new: "Category", kind: kind as CategoryKind } : { new: "Subcategory" } };
}

/** The fields of what was sent, or none when it isn't an object. */
const fieldsOf = (sent: unknown) => (typeof sent === "object" && sent !== null ? sent : {}) as Record<string, unknown>;

/**
 * A rules file's contents with `rule` added to the end of its rules, naming any existing Category and Subcategory as the
 * file spells them, and any new Category added after the others or new Subcategory added to the end of its Category's,
 * as 2-space JSON, leaving everything else unchanged and in order. Fails, quoting nothing from the file, when the file
 * doesn't read cleanly or wouldn't with the rule added, and refuses a new Category or Subcategory named the same as an
 * existing one or a new Category named Subscriptions (`subscriptionsRefusal`).
 */
export function withRule(contents: string | undefined, rule: RuleToSave): string {
  try {
    readRules(contents);
  } catch {
    // The reader's message quotes the file, so only says that it failed.
    throw new Error(`${RULES_FILE} doesn't read cleanly, so the rule wasn't saved. Fix ${RULES_FILE}, then reload the page to see the problem.`);
  }
  const refusal = subscriptionsRefusal(rule);
  if (refusal) throw new Error(refusal);
  const file = contents === undefined ? { categories: [], rules: [] } : (JSON.parse(contents) as { categories: Category[]; rules: unknown[] });
  const { adds, ...named } = rule;
  const added = "transfer" in named ? named : { ...named, ...spelledAsIn(file.categories, named, adds) };
  const categories = "transfer" in added || adds === undefined ? file.categories : withAddition(file.categories, added, adds);
  const updated = JSON.stringify({ ...file, categories, rules: [...file.rules, added] }, null, 2) + "\n";
  try {
    readRules(updated);
  } catch {
    throw new Error(`The rule wasn't saved. It needs "contains" text, and a Category and Subcategory from ${RULES_FILE} or Transfer.`);
  }
  return updated;
}

/** A rule's Category and Subcategory as the rules file spells them, leaving any it adds as named. */
function spelledAsIn(categories: Category[], { category, subcategory }: { category: string; subcategory: string }, adds: RuleToSave["adds"]) {
  const spelled = (names: string[], name: string) => names.find((existing) => sameName(existing, name)) ?? name;
  const spelledCategory = adds?.new === "Category" ? category : spelled(categories.map(({ name }) => name), category);
  const subcategories = categories.find(({ name }) => name === spelledCategory)?.subcategories ?? [];
  return { category: spelledCategory, subcategory: adds ? subcategory : spelled(subcategories, subcategory) };
}

/**
 * The rules file's Categories with the rule's new Category, holding just its Subcategory, added after them, or its new
 * Subcategory added to the end of its Category's Subcategories. Refuses a new name the same as an existing one by
 * `sameName`.
 */
function withAddition(categories: Category[], { category, subcategory }: { category: string; subcategory: string }, adds: NonNullable<RuleToSave["adds"]>): Category[] {
  const name = adds.new === "Category" ? category : subcategory;
  const same = (existing: string) => sameName(existing, name);
  const refuse = (existing: string) =>
    new Error(`${existing} named "${name}", so the rule wasn't saved. Choose it from the list, or give the new ${adds.new} another name.`);
  if (adds.new === "Category") {
    if (categories.some((c) => same(c.name))) throw refuse("There is already a Category");
    return [...categories, { name: category, kind: adds.kind, subcategories: [subcategory] }];
  }
  const existing = categories.find((c) => c.name === category);
  if (existing?.subcategories.some(same)) throw refuse(`${existing.name} already has a Subcategory`);
  return categories.map((c) => (c.name === category ? { ...c, subcategories: [...c.subcategories, subcategory] } : c));
}

/** Whether a description contains a rule's "contains" text, ignoring case. Blank text matches nothing. */
export function ruleMatches(contains: string, description: string): boolean {
  return contains.trim() !== "" && description.toLowerCase().includes(contains.toLowerCase());
}

/** The first Categorisation Rule in the list matching a description, which is the one that wins, or none when it is Uncategorised. */
export function categorise(rules: CategorisationRule[], { description }: { description: string }): CategorisationRule | undefined {
  return rules.find((rule) => ruleMatches(rule.contains, description));
}

/** The direction money moves to add to a Category of this kind: out for Spending, in for Earnings. */
export const directionOf = (kind: CategoryKind): Direction => (kind === "Spending" ? "Out" : "In");

/** The kind of Category money moving this way adds to: Spending for money out, Earnings for money in. */
export const kindOf = (direction: Direction): CategoryKind => (direction === "Out" ? "Spending" : "Earnings");

/**
 * A new Category's kind: Earnings when most of the Uncategorised descriptions its rule's `contains` text catches are
 * money in, and Spending otherwise, or the kind of `fallback`, the direction of the row the rule was started from, when
 * it catches none.
 */
export function kindFor(contains: string, uncategorised: UncategorisedDescription[], fallback: Direction): CategoryKind {
  const caught = uncategorised.filter(({ description }) => ruleMatches(contains, description));
  if (caught.length === 0) return kindOf(fallback);
  const moneyIn = caught.filter(({ direction }) => direction === "In").length;
  return moneyIn > caught.length - moneyIn ? "Earnings" : "Spending";
}

/**
 * A rule marked against `categories`, which may have changed since it was made, such as a Suggested Rule after another
 * is approved: naming a Category and Subcategory as the rules file spells them, and marked as adding its Category or
 * Subcategory only when that isn't there. A new Category keeps the kind it was marked with, or follows `kindFor`.
 */
export function markedNew(rule: RuleToSave, { uncategorised, categories }: { uncategorised: UncategorisedDescription[]; categories: Category[] }): RuleToSave {
  if ("transfer" in rule) return rule;
  const { contains, adds } = rule;
  const category = categories.find(({ name }) => sameName(rule.category, name));
  if (!category) {
    // With no row it was started from, a rule catching nothing starts as Spending, the usual case.
    const kind = adds?.new === "Category" ? adds.kind : kindFor(contains, uncategorised, "Out");
    return { contains, category: rule.category, subcategory: rule.subcategory, adds: { new: "Category", kind } };
  }
  const subcategory = category.subcategories.find((name) => sameName(rule.subcategory, name));
  if (!subcategory) return { contains, category: category.name, subcategory: rule.subcategory, adds: { new: "Subcategory" } };
  return { contains, category: category.name, subcategory };
}

/** What a rule with this "contains" text would catch among the Uncategorised descriptions. */
export type RulePreview = { descriptionCount: number; spending: Pence; earnings: Pence };

/** How many Uncategorised descriptions a rule's "contains" text would catch, and their Spending and Earnings totals. */
export function previewRule(contains: string, uncategorised: UncategorisedDescription[]): RulePreview {
  const caught = uncategorised.filter(({ description }) => ruleMatches(contains, description));
  const total = (direction: Direction) => caught.filter((d) => d.direction === direction).reduce((sum, d) => sum + d.pence, 0);
  return { descriptionCount: caught.length, spending: total("Out"), earnings: total("In") };
}
