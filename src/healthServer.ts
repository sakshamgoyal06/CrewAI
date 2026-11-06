import path from "node:path";

import express from "express";

import { healthListenPort } from "./env.js";
import { createHealthAppRouter } from "./healthApp/router.js";
import { logger } from "./logger.js";
import { securityHeaders } from "./securityHeaders.js";
import { loggableError } from "./util/loggableError.js";
import { supabase } from "./tools/clients.js";
import { serviceWorkerHandler } from "./swVersion.js";

/**
 * The signing cert of the published APK: the private release key held in GitHub secrets
 * (MAGNUS_KEYSTORE_*). A fingerprint is public by nature; only the key itself is secret. The
 * committed debug key is deliberately not vouched for, since anyone can sign with it.
 */
export const BUILT_APK_CERT_SHA256 =
  "8B:F8:2F:D8:38:70:07:FF:94:A8:84:4F:E9:98:52:9C:77:CF:07:8E:C3:51:51:48:93:A9:2F:D3:07:74:42:D7";

/**
 * Digital Asset Links for the Android app: the release APK's cert, plus any in
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
  // Railway's edge is the one proxy in front of us: req.ip is then the caller, for rate limits.
  app.set("trust proxy", 1);
  const appDir = process.env.MAGNUS_HEALTH_APP_DIR?.trim() || path.resolve("pwa");
  app.use(securityHeaders(appDir));
  // Health Connect syncs can carry a day or two of buckets; everything else is tiny.
  app.use("/api/health/ingest", express.json({ limit: "2mb" }));
  // Meal photos arrive as base64 JPEG, resized on the phone to ~1280 px (usually under 400 KB).
  app.use("/api/health/meals/photo", express.json({ limit: "16mb" }));
  app.use("/api/health/events", express.json({ limit: "128kb" }));
  app.use("/api/health/import/myfitnesspal", express.json({ limit: "2mb" }));
  // Razorpay signs the exact bytes, so the webhook needs the raw body.
  app.use("/api/health/billing/razorpay/webhook", express.raw({ type: "*/*", limit: "256kb" }));
  app.use(express.json({ limit: "32kb" }));

  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  app.get("/ready", async (_req, res) => {
    try {
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
  // The worker's cache name is a hash of the shell, so each deploy refreshes the app by itself.
  app.get("/app/sw.js", serviceWorkerHandler(appDir));
  app.use(
    "/app",
    express.static(appDir, {
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
