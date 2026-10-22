import { describe, expect, it } from "vitest";
import { categorise, directionOf, kindFor, kindOf, markedNew, previewRule, readRules, ruleToSave, subscriptionsRefusal, withRule } from "./rules.js";
import type { Category, RuleToSave } from "./rules.js";
import type { UncategorisedDescription } from "./spending.js";
import type { Direction } from "./statements.js";

// Made-up rules files. Every Category, Subcategory and description is invented.
const food = { name: "Food", kind: "Spending", subcategories: ["Groceries", "Eating Out"] };
const work = { name: "Work", kind: "Earnings", subcategories: ["Salary"] };

const rulesFile = (contents: unknown) => JSON.stringify(contents);

describe("readRules", () => {
  it("reads the Categories, each a Spending or Earnings Category with its Subcategories, and the Categorisation Rules in order", () => {
    const contents = rulesFile({
      categories: [food, work],
      rules: [
        { contains: "corner shop", category: "Food", subcategory: "Groceries" },
        { contains: "EMPLOYER LTD", category: "Work", subcategory: "Salary" },
        { contains: "corner", category: "Food", subcategory: "Eating Out" },
      ],
    });
    expect(readRules(contents)).toEqual({
      categories: [food, work],
      rules: [
        { contains: "corner shop", category: "Food", subcategory: "Groceries" },
        { contains: "EMPLOYER LTD", category: "Work", subcategory: "Salary" },
        { contains: "corner", category: "Food", subcategory: "Eating Out" },
      ],
    });
  });

  it("reads a rule marking Transactions as Transfers, which needs no Category", () => {
    const contents = rulesFile({ categories: [], rules: [{ contains: "CARD BILL", transfer: true }] });
    expect(readRules(contents)).toEqual({ categories: [], rules: [{ contains: "CARD BILL", transfer: true }] });
  });

  it("reads a Spending rule declaring it catches a Subscription, with its weekly, monthly or yearly interval", () => {
    const declared = ["Weekly", "Monthly", "Yearly"].map((subscription, i) => ({ contains: `SHOP ${i}`, category: "Food", subcategory: "Groceries", subscription }));
    const contents = rulesFile({ categories: [food], rules: declared });
    expect(readRules(contents).rules).toEqual(declared);
  });

  it("fails on a Subscription declared with an interval other than Weekly, Monthly or Yearly, quoting the rule", () => {
    const contents = rulesFile({ categories: [food], rules: [{ contains: "corner shop", category: "Food", subcategory: "Groceries", subscription: "Daily" }] });
    expect(() => readRules(contents)).toThrow(
      'rules.json has a rule whose "subscription" is not "Weekly", "Monthly" or "Yearly": {"contains":"corner shop","category":"Food","subcategory":"Groceries","subscription":"Daily"}',
    );
  });

  it("fails on a Transfer rule or an Earnings rule declaring a Subscription, since only Spending can be one", () => {
    const transfer = rulesFile({ categories: [], rules: [{ contains: "CARD BILL", transfer: true, subscription: "Monthly" }] });
    expect(() => readRules(transfer)).toThrow(
      'rules.json has a rule declaring a Subscription that is not Spending. Only a rule into a Spending Category can have "subscription": {"contains":"CARD BILL","transfer":true,"subscription":"Monthly"}',
    );
    const earnings = rulesFile({ categories: [work], rules: [{ contains: "EMPLOYER LTD", category: "Work", subcategory: "Salary", subscription: "Monthly" }] });
    expect(() => readRules(earnings)).toThrow(
      'rules.json has a rule declaring a Subscription that is not Spending. Only a rule into a Spending Category can have "subscription": {"contains":"EMPLOYER LTD","category":"Work","subcategory":"Salary","subscription":"Monthly"}',
    );
  });

  it("fails on a rule with no text to look for, since it would match every Transaction", () => {
    const contents = rulesFile({ categories: [], rules: [{ contains: "", transfer: true }] });
    expect(() => readRules(contents)).toThrow('rules.json has a rule with no "contains" text to look for: {"contains":"","transfer":true}');
  });

  it("gives no Categories and no rules when there is no rules file", () => {
    expect(readRules(undefined)).toEqual({ categories: [], rules: [] });
  });

  it("fails on a rules file that is not valid JSON, without quoting it", () => {
    const read = () => readRules('{ "rules": [ { "contains": "SECRET SHOP" ');
    expect(read).toThrow("rules.json is not valid JSON");
    expect(read).not.toThrow(/SECRET SHOP/);
  });

  it("fails on a rule naming an unknown Category, quoting the rule", () => {
    const contents = rulesFile({ categories: [food], rules: [{ contains: "corner shop", category: "Fod", subcategory: "Groceries" }] });
    expect(() => readRules(contents)).toThrow(
      'rules.json has a rule naming the unknown Category "Fod": {"contains":"corner shop","category":"Fod","subcategory":"Groceries"}',
    );
  });

  it("fails on a rule naming a Subcategory its Category doesn't have, quoting the rule", () => {
    const contents = rulesFile({ categories: [food, work], rules: [{ contains: "corner shop", category: "Food", subcategory: "Salary" }] });
    expect(() => readRules(contents)).toThrow(
      'rules.json has a rule naming "Salary", which is not a Subcategory of Food: {"contains":"corner shop","category":"Food","subcategory":"Salary"}',
    );
  });

  it("fails on a rule giving a Category without a Subcategory, quoting the rule", () => {
    const contents = rulesFile({ categories: [food], rules: [{ contains: "corner shop", category: "Food" }] });
    expect(() => readRules(contents)).toThrow(
      'rules.json has a rule with no "subcategory". Give it a Category and Subcategory, or "transfer": true: {"contains":"corner shop","category":"Food"}',
    );
  });

  it("fails on a rules file without a list of Categories and a list of rules", () => {
    expect(() => readRules(rulesFile({ rules: [] }))).toThrow('rules.json needs a "categories" list and a "rules" list');
    expect(() => readRules(rulesFile([]))).toThrow('rules.json needs a "categories" list and a "rules" list');
  });

  it("fails on a Category without a name or a list of Subcategories, quoting the Category", () => {
    expect(() => readRules(rulesFile({ categories: [{ name: "Food", kind: "Spending" }], rules: [] }))).toThrow(
      'rules.json has a Category without a "name" and a "subcategories" list: {"name":"Food","kind":"Spending"}',
    );
  });

  it("fails on two Categories with the same name, quoting the second", () => {
    const contents = rulesFile({ categories: [food, { ...work, name: "Food" }], rules: [] });
    expect(() => readRules(contents)).toThrow(
      'rules.json has a Category named the same as one before it: {"name":"Food","kind":"Earnings","subcategories":["Salary"]}',
    );
  });

  it("counts names as the same whatever their case and surrounding spaces, so Food and food can't both be Categories", () => {
    expect(() => readRules(rulesFile({ categories: [food, { ...work, name: " food" }], rules: [] }))).toThrow("rules.json has a Category named the same as one before it");
    expect(() => readRules(rulesFile({ categories: [{ ...food, subcategories: ["Groceries", "GROCERIES "] }], rules: [] }))).toThrow(
      "rules.json has a Category listing a Subcategory twice",
    );
  });

  it("fails on a Category listing the same Subcategory twice, since its Spending would count twice", () => {
    const contents = rulesFile({ categories: [{ ...food, subcategories: ["Groceries", "Groceries"] }], rules: [] });
    expect(() => readRules(contents)).toThrow(
      'rules.json has a Category listing a Subcategory twice: {"name":"Food","kind":"Spending","subcategories":["Groceries","Groceries"]}',
    );
  });

  it("fails on a rule giving neither a Category nor a Transfer, quoting the rule", () => {
    const noCategory = rulesFile({ categories: [food], rules: [{ contains: "corner shop", subcategory: "Groceries" }] });
    expect(() => readRules(noCategory)).toThrow(
      'rules.json has a rule with no "category". Give it a Category and Subcategory, or "transfer": true: {"contains":"corner shop","subcategory":"Groceries"}',
    );
    const transferNotTrue = rulesFile({ categories: [food], rules: [{ contains: "card bill", transfer: "yes" }] });
    expect(() => readRules(transferNotTrue)).toThrow(
      'rules.json has a rule whose "transfer" is not true. Give it a Category and Subcategory, or "transfer": true: {"contains":"card bill","transfer":"yes"}',
    );
  });

  it("fails on a Category whose kind is neither Spending nor Earnings, quoting the Category", () => {
    const contents = rulesFile({ categories: [food, { ...work, kind: "Income" }], rules: [] });
    expect(() => readRules(contents)).toThrow(
      'rules.json has a Category whose "kind" is not "Spending" or "Earnings": {"name":"Work","kind":"Income","subcategories":["Salary"]}',
    );
  });
});

describe("a Category named Subscriptions", () => {
  // Subscriptions are a view across Categories, never a Category (ADR 0005).
  const named = ["Subscriptions", "subscriptions", "  SUBSCRIPTIONS "];
  const refusal =
    'Subscriptions is a view across Categories, not a Category, so the rule wasn\'t saved. Sort it into a Category for what it is for, and tick "This is a Subscription" instead.';

  it("fails to load a rules file holding one, in any case or with surrounding spaces, saying how to fix it", () => {
    for (const name of named) {
      const contents = rulesFile({ categories: [food, { name, kind: "Spending", subcategories: ["Streaming"] }], rules: [] });
      expect(() => readRules(contents)).toThrow(
        'rules.json has a Category named Subscriptions, but Subscriptions is a view across Categories, not a Category. Move its rules into Categories for what they are for, mark each as a Subscription with "subscription": "Weekly", "Monthly" or "Yearly", then remove the Category',
      );
    }
  });

  it("refuses saving a rule that adds one, in any case or with surrounding spaces, saying to mark the rule as a Subscription", () => {
    const contents = rulesFile({ categories: [food], rules: [] });
    for (const name of named) {
      const rule: RuleToSave = { contains: "STREAMING CO", category: name, subcategory: "Streaming", adds: { new: "Category", kind: "Spending" } };
      expect(() => withRule(contents, rule)).toThrow(refusal);
    }
  });

  it("names the refusal for a rule that adds one, so the page can refuse it before saving, and nothing for any other rule", () => {
    expect(subscriptionsRefusal({ contains: "STREAMING CO", category: " subscriptions", subcategory: "Streaming", adds: { new: "Category", kind: "Spending" } })).toBe(refusal);
    expect(
      subscriptionsRefusal({ contains: "STREAMING CO", category: "Entertainment", subcategory: "Subscriptions", adds: { new: "Category", kind: "Spending" } }),
    ).toBeUndefined();
    expect(subscriptionsRefusal({ contains: "STREAMING CO", category: "Food", subcategory: "Groceries" })).toBeUndefined();
    expect(subscriptionsRefusal({ contains: "CARD BILL", transfer: true })).toBeUndefined();
  });
});

describe("categorise", () => {
  const rules = [
    { contains: "corner shop", category: "Food", subcategory: "Groceries" },
    { contains: "SHOP", category: "Fun", subcategory: "Shopping" },
    { contains: "CARD BILL", transfer: true as const },
  ];

  it("gives the first rule whose \"contains\" text the description holds, ignoring case, since the first in the list wins", () => {
    expect(categorise(rules, { description: "CORNER SHOP 0412" })).toBe(rules[0]);
    expect(categorise(rules, { description: "BOOK SHOP" })).toBe(rules[1]);
    expect(categorise(rules, { description: "AMEX CARD BILL" })).toBe(rules[2]);
  });

  it("gives nothing for a description no rule matches, which leaves it Uncategorised", () => {
    expect(categorise(rules, { description: "SKY AIRLINES" })).toBeUndefined();
  });
});

describe("directionOf and kindOf", () => {
  it("pair Spending with money out and Earnings with money in", () => {
    expect([directionOf("Spending"), directionOf("Earnings")]).toEqual(["Out", "In"]);
    expect([kindOf("Out"), kindOf("In")]).toEqual(["Spending", "Earnings"]);
  });
});

describe("ruleToSave", () => {
  it("keeps only a rule's \"contains\" text, as typed, and its Category and Subcategory, trimmed, or Transfer", () => {
    expect(ruleToSave({ contains: " CARD BILL ", transfer: true, category: "Food", note: "extra" })).toEqual({ contains: " CARD BILL ", transfer: true });
    expect(ruleToSave({ contains: "BP ", category: " Transport ", subcategory: "Fuel ", note: "extra" })).toEqual({ contains: "BP ", category: "Transport", subcategory: "Fuel" });
    expect(ruleToSave({ contains: "PET SHOP", category: " Pets", subcategory: "Food", adds: { new: "Category", kind: "Spending", note: "extra" } })).toEqual({
      contains: "PET SHOP",
      category: "Pets",
      subcategory: "Food",
      adds: { new: "Category", kind: "Spending" },
    });
  });

  it("fails saying what is wrong with a rule that can't be saved", () => {
    const named = { contains: "DELI", category: "Food", subcategory: "Deli" };
    for (const [rule, message] of [
      ["corner shop", 'The rule has no "contains" text to look for, so it wasn\'t saved.'],
      [{ contains: " ", transfer: true }, 'The rule has no "contains" text to look for, so it wasn\'t saved.'],
      [{ contains: "CARD BILL", transfer: "yes" }, 'The rule\'s "transfer" can only be true, so it wasn\'t saved.'],
      [{ contains: "DELI", category: "Food" }, "The rule needs a Category and Subcategory, or to be a Transfer, so it wasn't saved."],
      [{ contains: "DELI", category: " ", subcategory: "Deli" }, "The rule needs a Category and Subcategory, or to be a Transfer, so it wasn't saved."],
      [{ ...named, category: " ", adds: { new: "Category", kind: "Spending" } }, "The new Category needs a name, so the rule wasn't saved."],
      [{ ...named, subcategory: "", adds: { new: "Subcategory" } }, "The new Subcategory needs a name, so the rule wasn't saved."],
      [{ ...named, adds: { new: "Tag" } }, "The rule can only add a new Category or a new Subcategory, so it wasn't saved."],
      [{ ...named, adds: "Subcategory" }, "The rule can only add a new Category or a new Subcategory, so it wasn't saved."],
      [{ ...named, adds: { new: "Category", kind: "Pets" } }, "A new Category needs its kind, Spending or Earnings, so the rule wasn't saved."],
    ] as const) {
      expect(() => ruleToSave(rule)).toThrow(new Error(message));
    }
  });
});

describe("withRule", () => {
  it("appends the rule to the end of the rules list, leaving the Categories and earlier rules unchanged and in order, as 2-space JSON", () => {
    const contents = rulesFile({
      categories: [food, work],
      rules: [{ contains: "EMPLOYER LTD", category: "Work", subcategory: "Salary" }, { contains: "CARD BILL", transfer: true }],
    });
    expect(withRule(contents, { contains: "corner shop", category: "Food", subcategory: "Groceries" })).toBe(
      JSON.stringify(
        {
          categories: [food, work],
          rules: [
            { contains: "EMPLOYER LTD", category: "Work", subcategory: "Salary" },
            { contains: "CARD BILL", transfer: true },
            { contains: "corner shop", category: "Food", subcategory: "Groceries" },
          ],
        },
        null,
        2,
      ) + "\n",
    );
  });

  it("keeps a declared Subscription's interval on the rule it saves, so it reads back the same", () => {
    const contents = rulesFile({ categories: [food], rules: [{ contains: "CARD BILL", transfer: true }] });
    const saved = withRule(contents, { contains: "veg box", category: "food", subcategory: "groceries", subscription: "Weekly" });
    expect(readRules(saved).rules).toEqual([
      { contains: "CARD BILL", transfer: true },
      { contains: "veg box", category: "Food", subcategory: "Groceries", subscription: "Weekly" },
    ]);
  });

  it("fails when the rules file doesn't read cleanly, without quoting it", () => {
    const halfEdited = '{ "categories": [], "rules": [ { "contains": "SECRET SHOP" ';
    const unknownCategory = rulesFile({ categories: [], rules: [{ contains: "SECRET SHOP", category: "Fod", subcategory: "Groceries" }] });
    for (const contents of [halfEdited, unknownCategory]) {
      const save = () => withRule(contents, { contains: "CARD BILL", transfer: true });
      expect(save).toThrow("rules.json doesn't read cleanly, so the rule wasn't saved. Fix rules.json, then reload the page to see the problem.");
      expect(save).not.toThrow(/SECRET SHOP/);
    }
  });

  it("fails on a rule the rules file reader would refuse, such as one naming an unknown Category, so a saved file always loads", () => {
    const contents = rulesFile({ categories: [food], rules: [] });
    for (const rule of [
      { contains: "corner shop", category: "Fod", subcategory: "Groceries" },
      { contains: "corner shop", category: "Food", subcategory: "Salary" },
    ]) {
      expect(() => withRule(contents, rule)).toThrow(
        'The rule wasn\'t saved. It needs "contains" text, and a Category and Subcategory from rules.json or Transfer.',
      );
    }
  });

  it("adds a new Subcategory to the end of an existing Category's Subcategories, saved with the rule", () => {
    const contents = rulesFile({ categories: [food, work], rules: [] });
    const saved = withRule(contents, { contains: "SNACK BAR", category: "Food", subcategory: "Snacks", adds: { new: "Subcategory" } });
    expect(readRules(saved)).toEqual({
      categories: [{ ...food, subcategories: ["Groceries", "Eating Out", "Snacks"] }, work],
      rules: [{ contains: "SNACK BAR", category: "Food", subcategory: "Snacks" }],
    });
  });

  it("adds a new Category of the given kind with the rule's Subcategory after the existing Categories, saved with the rule", () => {
    const contents = rulesFile({ categories: [food, work], rules: [] });
    const saved = withRule(contents, { contains: "PET SHOP", category: "Pets", subcategory: "Food", adds: { new: "Category", kind: "Spending" } });
    expect(readRules(saved)).toEqual({
      categories: [food, work, { name: "Pets", kind: "Spending", subcategories: ["Food"] }],
      rules: [{ contains: "PET SHOP", category: "Pets", subcategory: "Food" }],
    });
  });

  it("refuses a new Category or Subcategory named the same as an existing one", () => {
    const contents = rulesFile({ categories: [food, work], rules: [] });
    expect(() => withRule(contents, { contains: "PAYROLL", category: "Work", subcategory: "Bonus", adds: { new: "Category", kind: "Earnings" } })).toThrow(
      'There is already a Category named "Work", so the rule wasn\'t saved. Choose it from the list, or give the new Category another name.',
    );
    expect(() => withRule(contents, { contains: "DELI", category: "Food", subcategory: "Groceries", adds: { new: "Subcategory" } })).toThrow(
      'Food already has a Subcategory named "Groceries", so the rule wasn\'t saved. Choose it from the list, or give the new Subcategory another name.',
    );
  });

  it("counts a new name as the same as an existing one whatever its case", () => {
    const contents = rulesFile({ categories: [food, work], rules: [] });
    expect(() => withRule(contents, { contains: "PAYROLL", category: "WORK", subcategory: "Bonus", adds: { new: "Category", kind: "Earnings" } })).toThrow(
      'There is already a Category named "WORK"',
    );
    expect(() => withRule(contents, { contains: "DELI", category: "Food", subcategory: "groceries", adds: { new: "Subcategory" } })).toThrow(
      'Food already has a Subcategory named "groceries"',
    );
  });

  it("saves the Category and Subcategory a rule names as the rules file spells them, whatever their case", () => {
    const contents = rulesFile({ categories: [food], rules: [] });
    expect(readRules(withRule(contents, { contains: "DELI", category: "food", subcategory: "GROCERIES" })).rules).toEqual([
      { contains: "DELI", category: "Food", subcategory: "Groceries" },
    ]);
    expect(readRules(withRule(contents, { contains: "DELI", category: "FOOD", subcategory: "Deli", adds: { new: "Subcategory" } }))).toEqual({
      categories: [{ ...food, subcategories: ["Groceries", "Eating Out", "Deli"] }],
      rules: [{ contains: "DELI", category: "Food", subcategory: "Deli" }],
    });
  });

  it("refuses a new Subcategory of an unknown Category", () => {
    const contents = rulesFile({ categories: [food], rules: [] });
    expect(() => withRule(contents, { contains: "DELI", category: "Fod", subcategory: "Deli", adds: { new: "Subcategory" } })).toThrow(
      'The rule wasn\'t saved. It needs "contains" text, and a Category and Subcategory from rules.json or Transfer.',
    );
  });

  it("creates a rules file holding the new Category and the rule when there is none", () => {
    const saved = withRule(undefined, { contains: "MARKET STALL", category: "Side Work", subcategory: "Sales", adds: { new: "Category", kind: "Earnings" } });
    expect(readRules(saved)).toEqual({
      categories: [{ name: "Side Work", kind: "Earnings", subcategories: ["Sales"] }],
      rules: [{ contains: "MARKET STALL", category: "Side Work", subcategory: "Sales" }],
    });
  });
});

// Made-up Uncategorised descriptions. Every description and figure is invented.
const uncategorised = (description: string, direction: Direction, pence: number): UncategorisedDescription => ({
  description,
  direction,
  pence,
  transactions: [],
});

const descriptions = [
  uncategorised("CORNER SHOP 0412", "Out", 4500),
  uncategorised("Corner Shop 0577", "Out", 1250),
  uncategorised("CORNER SHOP REFUND", "In", 300),
  uncategorised("SKY AIRLINES", "Out", 148000),
];

describe("previewRule", () => {
  it("counts the Uncategorised descriptions a rule's \"contains\" text catches, ignoring case, with their Spending and Earnings totals", () => {
    expect(previewRule("corner shop", descriptions)).toEqual({ descriptionCount: 3, spending: 5750, earnings: 300 });
  });

  it("catches nothing with blank \"contains\" text, which the rules file reader refuses", () => {
    expect(previewRule("  ", descriptions)).toEqual({ descriptionCount: 0, spending: 0, earnings: 0 });
  });
});

describe("kindFor", () => {
  it("makes a new Category Earnings when most of the Uncategorised descriptions its rule catches are money in", () => {
    const refunds = [...descriptions, uncategorised("CORNER SHOP CASHBACK", "In", 100), uncategorised("CORNER SHOP PRIZE", "In", 5000), uncategorised("CORNER SHOP RAFFLE", "In", 200)];
    expect(kindFor("corner shop", refunds, "Out")).toBe("Earnings");
    expect(kindFor("corner shop", descriptions, "In")).toBe("Spending");
  });

  it("makes it Spending when they are as often money out as money in", () => {
    expect(kindFor("corner shop", [...descriptions, uncategorised("CORNER SHOP PRIZE", "In", 5000)], "In")).toBe("Spending");
  });

  it("follows the direction of the row the rule was started from when its \"contains\" text catches nothing", () => {
    expect(kindFor("NOWHERE", descriptions, "In")).toBe("Earnings");
    expect(kindFor("NOWHERE", descriptions, "Out")).toBe("Spending");
  });
});

describe("markedNew", () => {
  const categories = [food, work] as Category[];
  const marked = (rule: RuleToSave) => markedNew(rule, { uncategorised: descriptions, categories });

  it("names an existing Category and Subcategory as the rules file spells them, marked as adding nothing", () => {
    expect(marked({ contains: "CORNER SHOP", category: "food ", subcategory: "GROCERIES", adds: { new: "Category", kind: "Spending" } })).toEqual({
      contains: "CORNER SHOP",
      category: "Food",
      subcategory: "Groceries",
    });
  });

  it("keeps a rule's subscription mark, whether its Category and Subcategory are existing or new", () => {
    expect(marked({ contains: "VEG BOX", category: "food", subcategory: "groceries", subscription: "Weekly" })).toEqual({
      contains: "VEG BOX",
      category: "Food",
      subcategory: "Groceries",
      subscription: "Weekly",
    });
    expect(marked({ contains: "VEG BOX", category: "Food", subcategory: "Boxes", subscription: "Weekly" })).toMatchObject({ subscription: "Weekly" });
    expect(marked({ contains: "VEG BOX", category: "Boxes", subcategory: "Veg", subscription: "Weekly" })).toMatchObject({ subscription: "Weekly" });
  });

  it("marks a Subcategory its Category doesn't have as new, under the Category as the rules file spells it", () => {
    expect(marked({ contains: "CORNER SHOP", category: "FOOD", subcategory: "Snacks" })).toEqual({
      contains: "CORNER SHOP",
      category: "Food",
      subcategory: "Snacks",
      adds: { new: "Subcategory" },
    });
  });

  it("marks a Category not in the rules file as new, keeping the kind it was suggested with, or else following kindFor", () => {
    expect(marked({ contains: "SKY", category: "Travel", subcategory: "Flights", adds: { new: "Category", kind: "Earnings" } })).toEqual({
      contains: "SKY",
      category: "Travel",
      subcategory: "Flights",
      adds: { new: "Category", kind: "Earnings" },
    });
    expect(marked({ contains: "REFUND", category: "Returns", subcategory: "Shops", adds: { new: "Subcategory" } })).toEqual({
      contains: "REFUND",
      category: "Returns",
      subcategory: "Shops",
      adds: { new: "Category", kind: "Earnings" },
    });
  });

  it("leaves a Transfer as it is", () => {
    expect(marked({ contains: "CARD BILL", transfer: true })).toEqual({ contains: "CARD BILL", transfer: true });
  });
});
