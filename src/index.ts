import "dotenv/config";

import { logger } from "./logger.js";
import { loggableError } from "./util/loggableError.js";
import "./tools/clients.js";
import { startHealthServer } from "./healthServer.js";

async function main(): Promise<void> {
  const server = await startHealthServer();

  let shuttingDown = false;
  const shutdown = (signal: string): void => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    logger.info({ signal }, "shutting down");
    void server.close().then(() => process.exit(0));
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
