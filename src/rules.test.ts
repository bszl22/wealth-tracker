import { describe, expect, it } from "vitest";
import { readRules } from "./rules.js";

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
