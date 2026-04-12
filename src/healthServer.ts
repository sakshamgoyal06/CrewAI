import express from "express";

import { healthListenPort } from "./env.js";
import { logger } from "./logger.js";
import { loggableError } from "./util/loggableError.js";
import { redis, supabase } from "./tools/clients.js";

export function startHealthServer(): Promise<void> {
  const app = express();
  app.disable("x-powered-by");

  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  app.get("/ready", async (_req, res) => {
    try {
      const ping = await redis.ping();
      if (ping !== "PONG") {
        throw new Error(`redis ping: ${String(ping)}`);
      }
      const { error } = await supabase
        .from("user_profile")
        .select("id", { head: true, count: "exact" });
      if (error) {
        throw error;
      }
      res.status(200).json({ status: "ready" });
    } catch (err) {
      logger.warn({ err: loggableError(err) }, "readiness check failed");
      res.status(503).json({ status: "not_ready" });
    }
  });

  const port = healthListenPort();
  return new Promise((resolve, reject) => {
    const server = app.listen(port, () => {
      logger.info({ port }, "health server listening");
      resolve();
    });
    server.on("error", reject);
  });
}
