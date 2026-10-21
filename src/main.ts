import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { claudeWith } from "./claude.js";
import { localToday } from "./report.js";
import { rulesFileIn } from "./rulesFile.js";
import { readStatements } from "./scanStatements.js";
import { startServer } from "./server.js";
import { loadSettings } from "./settings.js";
import { createTracker } from "./tracker.js";

const PORT = 4321;

try {
  const { dataFolder, trackingStart } = await loadSettings(fileURLToPath(new URL("..", import.meta.url)));
  const apiKey = process.env.ANTHROPIC_API_KEY;
  await startServer(
    createTracker({
      readStatements: () => readStatements(dataFolder),
      rulesFile: rulesFileIn(dataFolder),
      claude: apiKey ? claudeWith(apiKey) : undefined,
      trackingStart,
      today: localToday,
    }),
    PORT,
  );
  const url = `http://127.0.0.1:${PORT}/`;
  console.log(`Wealth Tracker is running at ${url}`);
  execFile("open", [url]);
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
}
