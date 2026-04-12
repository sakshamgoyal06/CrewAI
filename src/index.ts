import "dotenv/config";

import { logger } from "./logger.js";
import { loggableError } from "./util/loggableError.js";
import "./tools/clients.js";
import { startHealthServer } from "./healthServer.js";
import { createMagnus, handleMessage } from "./magnus.js";
import { startBot } from "./tools/telegram.js";

const magnus = createMagnus();
magnus.start();

async function main(): Promise<void> {
  await startHealthServer();
  await startBot(async (text, reply, telegramUserId, updateId) => {
    try {
      const out = await handleMessage(text, telegramUserId, updateId);
      reply(out);
    } catch (err) {
      logger.error({ err: loggableError(err) }, "handleMessage failed");
      reply("Something went wrong. Check server logs.");
    }
  });
}

void main().then(() => {
  logger.info("Magnus online (Telegram + health)");
});
