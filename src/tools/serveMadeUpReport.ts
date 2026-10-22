import { startServer } from "../server.js";
import { madeUpTracker } from "./madeUpReport.js";

// Serves the page with the made-up Report, so screenshots never show real figures. Rules saved on the page go into
// the made-up rules file in memory, and are gone when it stops. PORT picks another port, so several can run at once.

const PORT = Number(process.env.PORT ?? 4400);

try {
  await startServer(madeUpTracker(), PORT);
  console.log(`Wealth Tracker, with a made-up Report, is running at http://127.0.0.1:${PORT}/`);
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
}
