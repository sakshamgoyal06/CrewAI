import path from "node:path";

import express from "express";

import { healthListenPort } from "./env.js";
import { createHealthAppRouter } from "./healthApp/router.js";
import { logger } from "./logger.js";
import { loggableError } from "./util/loggableError.js";
import { redis, supabase } from "./tools/clients.js";

/**
 * The signing cert of the APK that CI builds (android/app/magnus-debug.keystore, committed, so the
 * fingerprint is public). Vouching for it lets that APK open full screen with no browser bar.
 */
export const BUILT_APK_CERT_SHA256 =
  "8E:67:88:10:B2:47:88:B6:F5:97:DD:93:6B:AD:00:FB:C5:5D:8B:25:B7:FF:39:D2:6A:08:A0:94:67:37:8C:D2";

/**
 * Digital Asset Links for the Android app: the CI-built APK's cert, plus any in
 * MAGNUS_ANDROID_CERT_SHA256 (comma-separated, e.g. a Play signing key).
 * MAGNUS_ANDROID_CERT_SHA256=none turns the built-in one off.
 */
export function assetLinks(env: NodeJS.ProcessEnv): unknown[] {
  const raw = env.MAGNUS_ANDROID_CERT_SHA256 ?? "";
  const configured = raw
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s) => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(s));
  const fingerprints = [...new Set([...(raw.trim().toLowerCase() === "none" ? [] : [BUILT_APK_CERT_SHA256]), ...configured])];
  if (!fingerprints.length) return [];
  return [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: env.MAGNUS_ANDROID_PACKAGE?.trim() || "app.magnus.health",
        sha256_cert_fingerprints: fingerprints,
      },
    },
  ];
}

export type HealthServer = {
  close: () => Promise<void>;
};

/** HTTP server for the health PWA: static app at `/app`, JSON API at `/api/health`, probes. */
export function startHealthServer(): Promise<HealthServer> {
  const app = express();
  app.disable("x-powered-by");
  // Health Connect syncs can carry a day or two of buckets; everything else is tiny.
  app.use("/api/health/ingest", express.json({ limit: "2mb" }));
  // Meal photos arrive as base64 JPEG, resized on the phone to ~1280 px (usually under 400 KB).
  app.use("/api/health/meals/photo", express.json({ limit: "8mb" }));
  app.use("/api/health/events", express.json({ limit: "128kb" }));
  // Razorpay signs the exact bytes, so the webhook needs the raw body.
  app.use("/api/health/billing/razorpay/webhook", express.raw({ type: "*/*", limit: "256kb" }));
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

  // Digital Asset Links: lets the Android app open the PWA full screen (no browser bar).
  app.get("/.well-known/assetlinks.json", (_req, res) => {
    res.json(assetLinks(process.env));
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
  // The landing page; the app itself lives at /app.
  const siteDir = process.env.MAGNUS_SITE_DIR?.trim() || path.resolve("site");
  app.get("/", (_req, res) => {
    res.sendFile(path.join(siteDir, "index.html"), (err) => {
      if (err && !res.headersSent) res.redirect(302, "/app/");
    });
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
