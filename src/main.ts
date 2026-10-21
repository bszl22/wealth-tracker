import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { askClaude } from "./claude.js";
import { statementsReport } from "./report.js";
import { saveRule } from "./rules.js";
import { startServer } from "./server.js";
import { loadSettings } from "./settings.js";
import { askForSuggestedRules } from "./suggestions.js";

const PORT = 4321;

try {
  const settings = await loadSettings(fileURLToPath(new URL("..", import.meta.url)));
  await startServer(
    {
      report: () => statementsReport(settings),
      saveRule: (rule) => saveRule(settings.dataFolder, rule),
      suggestRules: async (ticked) => askForSuggestedRules(await statementsReport(settings), ticked, askClaude),
    },
    PORT,
  );
  const url = `http://127.0.0.1:${PORT}/`;
  console.log(`Wealth Tracker is running at ${url}`);
  execFile("open", [url]);
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
}
