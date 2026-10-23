import type { Goal } from "./goal.js";
import { buildReport, type Report, type YearMonth } from "./report.js";
import { readRules, withRule, type RuleToSave } from "./rules.js";
import type { RulesFile } from "./rulesFile.js";
import { reconcileStatements, type StatementRead } from "./scanStatements.js";
import type { IsoDate } from "./statements.js";
import { askForSuggestedRules, type AskClaude, type SentDescription, type SuggestedRule } from "./suggestions.js";

/**
 * What the page can ask of the tracker: the Report, saving one Categorisation Rule to the end of the rules file, and
 * Suggested Rules from Claude for the ticked rows of the about-to-send list.
 */
export type Tracker = {
  report: () => Promise<Report>;
  saveRule: (rule: RuleToSave) => Promise<void>;
  suggestRules: (ticked: SentDescription[]) => Promise<SuggestedRule[]>;
};

/** Where the tracker reads from and what it asks: real in main.ts, invented for the made-up tracker. */
export type TrackerAdapters = {
  /** Every Statement file read, before reconciling. */
  readStatements: () => Promise<StatementRead[]>;
  rulesFile: RulesFile;
  /**
   * Claude, when an API key is set, so Suggested Rules can be asked for. Only `claudeWith` sends anything off the Mac,
   * and main.ts is the only place that passes it (CODING_STANDARDS › Data leaving the Mac).
   */
  claude: AskClaude | undefined;
  trackingStart: YearMonth;
  goal: Goal | undefined;
  today: () => IsoDate;
};

/**
 * The tracker, built from its adapters. Every Report, and every ask for Suggested Rules, rereads every Statement and the
 * rules file (ADR 0001). Saves made together each add their rule to the contents the one before wrote, and a failed
 * save doesn't stop the next.
 */
export function createTracker({ readStatements, rulesFile, claude, trackingStart, goal, today }: TrackerAdapters): Tracker {
  const report = async () => {
    const statements = reconcileStatements(await readStatements());
    const contents = await rulesFile.read();
    const { categories, rules } = readRules(contents);
    const found = contents !== undefined;
    return buildReport({ statements, categories, rules, rulesFile: { path: rulesFile.path, found }, trackingStart, today: today(), apiKeySet: claude !== undefined, goal });
  };
  let saving: Promise<unknown> = Promise.resolve();
  return {
    report,
    saveRule: (rule) => {
      const save = saving.then(async () => rulesFile.write(withRule(await rulesFile.read(), rule)));
      saving = save.catch(() => undefined);
      return save;
    },
    suggestRules: async (ticked) => {
      if (!claude) throw new Error("ANTHROPIC_API_KEY isn't set, so Claude can't be asked. Set it in the shell that runs npm start, then start the tracker again.");
      return askForSuggestedRules(await report(), ticked, claude);
    },
  };
}
