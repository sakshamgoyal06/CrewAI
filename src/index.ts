import "dotenv/config";

import { startHealthServer } from "./healthServer.js";
import { startTelegramMaintenance } from "./telegramMaintenance.js";

async function main(): Promise<void> {
  const health = await startHealthServer();

  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const telegram = token ? await startTelegramMaintenance(token) : undefined;

  const shutdown = async (signal: string) => {
    console.log(`shutdown: ${signal}`);
    await telegram?.stop();
    await health.close();
    process.exit(0);
  };

  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
