import "dotenv/config";

import { logger } from "./logger.js";
import { loggableError } from "./util/loggableError.js";
import "./tools/clients.js";
import { healthAppAuthConfig } from "./healthApp/auth.js";
import { flushEvents } from "./healthApp/events.js";
import { startProactiveScheduler } from "./healthApp/proactive.js";
import { startHealthServer } from "./healthServer.js";
import { ensureFoodSeed } from "./meals/indianFoodSeed.js";

async function main(): Promise<void> {
  const server = await startHealthServer();
  const owner = healthAppAuthConfig()?.userProfileId;
  // Optional. Without it there is no owner: everyone, the deploy owner included, is a normal
  // Google account (trial, billing, delete account). Set it only to keep the old owner shortcuts.
  if (process.env.MAGNUS_HEALTH_APP_TOKEN?.trim() && !owner) {
    logger.info("MAGNUS_HEALTH_APP_USER_PROFILE_ID not set: the legacy owner token is off; everyone signs in with Google as a normal user");
  }
  const stopProactive = startProactiveScheduler(owner ? [owner] : []);
  // Everyday Indian foods, so a new account's first meals resolve from our own table.
  void ensureFoodSeed().catch(() => {});

  let shuttingDown = false;
  const shutdown = (signal: string): void => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    logger.info({ signal }, "shutting down");
    stopProactive();
    void server
      .close()
      .then(() => flushEvents())
      .catch(() => {})
      .then(() => process.exit(0));
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
    logger.info("Magnus health app online");
  })
  .catch((err: unknown) => {
    logger.fatal({ err: loggableError(err) }, "startup failed");
    process.exit(1);
  });
