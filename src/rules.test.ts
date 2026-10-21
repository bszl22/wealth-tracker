import { describe, expect, it } from "vitest";
import { readRules, withRule } from "./rules.js";

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
      { contains: " ", transfer: true },
      "corner shop",
      { contains: "PET SHOP", category: "Pets", subcategory: "Food", adds: { new: "Category", kind: "Pets" } },
      { contains: "DELI", category: "Food", subcategory: "Deli", adds: { new: "Tag" } },
      { contains: "DELI", category: "Food", subcategory: "Deli", adds: "Subcategory" },
    ]) {
      expect(() => withRule(contents, rule)).toThrow(
        'The rule wasn\'t saved. It needs "contains" text, and a Category and Subcategory from rules.json or Transfer.',
      );
    }
  });

  it("saves only the rule's \"contains\" text and its Category and Subcategory or Transfer", () => {
    const contents = rulesFile({ categories: [food], rules: [] });
    const saved = withRule(contents, { contains: "CARD BILL", transfer: true, category: "Food", note: "extra" });
    expect(JSON.parse(saved).rules).toEqual([{ contains: "CARD BILL", transfer: true }]);
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

  it("counts a new name as the same as an existing one whatever its case and surrounding spaces", () => {
    const contents = rulesFile({ categories: [food, work], rules: [] });
    expect(() => withRule(contents, { contains: "PAYROLL", category: " work ", subcategory: "Bonus", adds: { new: "Category", kind: "Earnings" } })).toThrow(
      'There is already a Category named "work"',
    );
    expect(() => withRule(contents, { contains: "DELI", category: "Food", subcategory: "groceries ", adds: { new: "Subcategory" } })).toThrow(
      'Food already has a Subcategory named "groceries"',
    );
  });

  it("saves a new name without its surrounding spaces", () => {
    const contents = rulesFile({ categories: [food], rules: [] });
    const saved = withRule(contents, { contains: "PET SHOP", category: " Pets ", subcategory: " Food", adds: { new: "Category", kind: "Spending" } });
    expect(readRules(saved)).toEqual({
      categories: [food, { name: "Pets", kind: "Spending", subcategories: ["Food"] }],
      rules: [{ contains: "PET SHOP", category: "Pets", subcategory: "Food" }],
    });
  });

  it("refuses a new Category or Subcategory with no name, or a new Subcategory of an unknown Category", () => {
    const contents = rulesFile({ categories: [food], rules: [] });
    expect(() => withRule(contents, { contains: "PET SHOP", category: " ", subcategory: "Food", adds: { new: "Category", kind: "Spending" } })).toThrow(
      "The new Category needs a name, so the rule wasn't saved.",
    );
    expect(() => withRule(contents, { contains: "DELI", category: "Food", subcategory: "", adds: { new: "Subcategory" } })).toThrow(
      "The new Subcategory needs a name, so the rule wasn't saved.",
    );
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
