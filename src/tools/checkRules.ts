import { fileURLToPath } from "node:url";
import { localToday } from "../report.js";
import { categorise, readRules, ruleMatches, type CategorisationRule } from "../rules.js";
import { rulesFileIn } from "../rulesFile.js";
import { readStatements, reconcileStatements } from "../scanStatements.js";
import { loadSettings } from "../settings.js";
import type { Transaction } from "../spending.js";
import { findSubscriptions, INTERVALS, notASubscriptionBecause, type Subscription } from "../subscriptions.js";
import { pounds } from "./pounds.js";

// Checks the rules file against the real Statements, printing to the terminal only.
// With no argument: whether the rules file loads, then the Subscriptions it gives. With text, e.g. "VOXI": every
// Transaction whose description contains it, grouped by the rule that matches, and whether each group is a Subscription
// or why not. Descriptions never reach the terminal: a group is named by its rule, or numbered when no rule matches.

const [text = ""] = process.argv.slice(2);
/** The gaps and charges each interval needs, for saying why charges are no Subscription. */
const allowed = Object.entries(INTERVALS)
  .map(([interval, { gapDays: [min, max], fewestCharges }]) => `${interval} ${min}–${max} days apart, ${fewestCharges}+ charges`)
  .join("; ");
try {
  const settings = await loadSettings(fileURLToPath(new URL("../..", import.meta.url)));
  const rulesFile = rulesFileIn(settings.dataFolder);
  const contents = await rulesFile.read();
  const { categories, rules } = readRules(contents);
  console.log(contents === undefined ? `No rules file at ${rulesFile.path}` : `Rules file loads: ${categories.length} Categories, ${rules.length} rules`);
  const { transactions } = reconcileStatements(await readStatements(settings.dataFolder));
  const { subscriptions } = findSubscriptions({ transactions, categories, rules, today: localToday() });
  if (text === "") printSubscriptions(subscriptions);
  else printMatching(transactions.filter(({ description }) => ruleMatches(text, description)));

  function printSubscriptions(subscriptions: Subscription[]) {
    console.log("\nSubscriptions (current first, largest yearly cost first)");
    for (const s of subscriptions) {
      const name = s.transactions.some((t) => categorise(rules, t)) ? s.name : "A description no rule matches";
      const how = s.declared ? "declared" : "found";
      console.log(`  ${name}: ${how} ${s.interval}, usual ${pounds(s.usual)}, ${pounds(s.yearlyCost)} a year, last ${s.lastCharge}, ${s.current ? "Current" : "Lapsed"}`);
    }
  }

  function printMatching(matching: Transaction[]) {
    console.log(`\n${matching.length} Transactions contain "${text}"`);
    const groups = new Map<CategorisationRule | string, Transaction[]>();
    for (const t of matching) {
      const key = categorise(rules, t) ?? t.description;
      groups.set(key, [...(groups.get(key) ?? []), t]);
    }
    let unmatched = 0;
    for (const [rule, charges] of groups) {
      console.log(`\n${typeof rule === "string" ? `No rule matches (description ${++unmatched})` : ruleText(rule)}`);
      for (const { date, pence, direction, account } of charges) console.log(`  ${date}  ${pounds(pence).padStart(10)} ${direction === "Out" ? "out" : "in "}  ${account}`);
      console.log(`  ${verdict(rule, charges)}`);
    }
  }

  function ruleText(rule: CategorisationRule): string {
    if ("transfer" in rule) return `Rule "${rule.contains}" → Transfer`;
    const marked = rule.subscription === undefined ? "" : rule.subscription === false ? ", marked as no Subscription" : `, declared ${rule.subscription}`;
    return `Rule "${rule.contains}" → ${rule.category} › ${rule.subcategory}${marked}`;
  }

  /** Whether one group's charges are a Subscription, judged on every charge out its rule (or description) gets, not just these. */
  function verdict(rule: CategorisationRule | string, charges: Transaction[]): string {
    const found = subscriptions.find((s) => charges.some((t) => s.transactions.includes(t)));
    if (found) return `Subscription: ${found.declared ? "declared" : "found"} ${found.interval}, usual ${pounds(found.usual)}, ${found.current ? "Current" : "Lapsed"}`;
    if (typeof rule !== "string") {
      if ("transfer" in rule) return "Not a Subscription: Transfers never are";
      if (categories.find(({ name }) => name === rule.category)?.kind !== "Spending") return "Not a Subscription: its rule sorts into an Earnings Category";
      if (rule.subscription === false) return "Not a Subscription: its rule is marked as catching none";
    }
    const out = transactions.filter((t) => t.direction === "Out" && (typeof rule === "string" ? !categorise(rules, t) && t.description === rule : categorise(rules, t) === rule));
    if (out.length === 0) return "Not a Subscription: no money out";
    const because = notASubscriptionBecause(out);
    if (!because) return "Not a Subscription";
    if ("charge" in because) return `Not a Subscription: the ${pounds(because.charge.pence)} charge on ${because.charge.date} is more than 10% from the usual ${pounds(because.usual)}`;
    if (out.length === 1) return "Not a Subscription: one charge, too few to show it repeats";
    return `Not a Subscription: ${out.length} charges, ${because.gaps.join(", ")} days apart, fit no interval (${allowed})`;
  }
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
}
