import path from "node:path";

import express from "express";

import { healthListenPort } from "./env.js";
import { createHealthAppRouter } from "./healthApp/router.js";
import { logger } from "./logger.js";
import { loggableError } from "./util/loggableError.js";
import { redis, supabase } from "./tools/clients.js";

export type HealthServer = {
  close: () => Promise<void>;
};

/** HTTP server for the health PWA: static app at `/app`, JSON API at `/api/health`, probes. */
export function startHealthServer(): Promise<HealthServer> {
  const app = express();
  app.disable("x-powered-by");
  // Health Connect syncs can carry a day or two of buckets; everything else is tiny.
  app.use("/api/health/ingest", express.json({ limit: "2mb" }));
  app.use(express.json({ limit: "32kb" }));

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

  app.use("/api/health", createHealthAppRouter());
  app.use(
    "/app",
    express.static(process.env.MAGNUS_HEALTH_APP_DIR?.trim() || path.resolve("pwa"), {
      index: "index.html",
      setHeaders: (res, filePath) => {
        if (filePath.endsWith("sw.js")) {
          res.setHeader("Cache-Control", "no-cache");
          res.setHeader("Service-Worker-Allowed", "/app/");
        }
      },
    }),
  );
  app.get("/", (_req, res) => {
    res.redirect(302, "/app/");
  });

  const port = healthListenPort();
  const injectedPort = process.env.PORT?.trim();
  if (injectedPort && injectedPort !== String(port)) {
    // Railway, Render and friends route to PORT; binding elsewhere fails the healthcheck.
    logger.warn(
      { listening: port, platformPort: injectedPort },
      "HEALTH_PORT differs from the platform's PORT — unset HEALTH_PORT on a managed host",
    );
  }

  return new Promise((resolve, reject) => {
    const server = app.listen(port, () => {
      logger.info({ port }, "health server listening");
      resolve({
        close: () =>
          new Promise<void>((done) => {
            server.close(() => done());
          }),
      });
    });
    server.on("error", reject);
  });
}
