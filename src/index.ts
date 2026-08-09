import "dotenv/config";

import { logger } from "./logger.js";
import { loggableError } from "./util/loggableError.js";
import "./tools/clients.js";
import {
  capabilityLogFields,
  describeCapabilities,
} from "./config/magnusCapabilities.js";
import { startHealthServer } from "./healthServer.js";
import { createMagnus, handleMessage } from "./magnus.js";
import { createTelegramRuntime } from "./tools/telegram.js";
import {
  startTelegramWatchdog,
  watchdogFailureThreshold,
  watchdogIntervalMs,
} from "./tools/telegramWatchdog.js";

const magnus = createMagnus();
magnus.start();

async function main(): Promise<void> {
  logger.info(
    capabilityLogFields(describeCapabilities()),
    "capabilities (npm run telegram:check for detail)",
  );

  const telegram = createTelegramRuntime(
    async (incoming, reply, telegramUserId, updateId, sendTyping) => {
      try {
        const messages = await handleMessage(incoming.text, telegramUserId, {
          updateId,
          sendTyping,
          mealPhoto: incoming.mealPhoto,
        });
        for (const chunk of messages) {
          await reply(chunk, { parse_mode: "HTML" });
        }
      } catch (err) {
        logger.error({ err: loggableError(err) }, "handleMessage failed");
        await reply("Something went wrong. Check server logs.");
      }
    },
  );

  const health = await startHealthServer({ telegramWebhook: telegram.webhook });
  await telegram.start();

  const stopWatchdog = startTelegramWatchdog({
    getMe: telegram.getMe,
    getWebhookUrl: telegram.webhook ? telegram.getWebhookUrl : undefined,
    expectedWebhookUrl: telegram.webhook?.url,
    repairWebhook: telegram.webhook ? telegram.registerWebhook : undefined,
    intervalMs: watchdogIntervalMs(),
    failureThreshold: watchdogFailureThreshold(),
    onFatal: (reason) => {
      logger.fatal({ reason }, "telegram unreachable; exiting for a restart");
      process.exit(1);
    },
  });

  let shuttingDown = false;
  const shutdown = (signal: string): void => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    logger.info({ signal }, "shutting down");
    stopWatchdog();
    telegram.stop(signal);
    void health.close().then(() => process.exit(0));
    // Never hold a redeploy hostage waiting on in-flight work.
    setTimeout(() => process.exit(0), 10_000).unref();
  };

  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
}

process.on("unhandledRejection", (reason) => {
  logger.error({ err: loggableError(reason) }, "unhandled promise rejection");
});

process.on("uncaughtException", (err) => {
  logger.fatal({ err: loggableError(err) }, "uncaught exception; exiting for a restart");
  process.exit(1);
});

void main()
  .then(() => {
    logger.info("Magnus online (Telegram + health)");
  })
  .catch((err: unknown) => {
    logger.fatal({ err: loggableError(err) }, "startup failed");
    process.exit(1);
  });
