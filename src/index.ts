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
  await startBot(async (text, reply, telegramUserId, updateId, sendTyping) => {
    try {
      const messages = await handleMessage(text, telegramUserId, {
        updateId,
        sendProgress: (html) => reply(html, { parse_mode: "HTML" }),
        sendTyping,
      });
      for (const chunk of messages) {
        await reply(chunk, { parse_mode: "HTML" });
      }
    } catch (err) {
      logger.error({ err: loggableError(err) }, "handleMessage failed");
      await reply("Something went wrong. Check server logs.");
    }
  });
}

void main().then(() => {
  logger.info("Magnus online (Telegram + health)");
});
