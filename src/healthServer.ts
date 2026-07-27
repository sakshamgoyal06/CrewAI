import express from "express";

import { healthListenPort } from "./env.js";
import { morningBriefInternalSecret } from "./jobs/morningBriefEnv.js";
import { runMorningBrief } from "./jobs/morningBrief.js";
import { logger } from "./logger.js";
import { loggableError } from "./util/loggableError.js";
import { redis, supabase } from "./tools/clients.js";

export type HealthServerOptions = {
  /** Webhook mode: Telegram POSTs updates to this path on the same port as the health checks. */
  telegramWebhook?: {
    path: string;
    secretToken: string;
    handleUpdate: (update: unknown) => Promise<void>;
  };
};

export type HealthServer = {
  close: () => Promise<void>;
};

export function startHealthServer(options: HealthServerOptions = {}): Promise<HealthServer> {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "32kb" }));

  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  const hook = options.telegramWebhook;
  if (hook) {
    /**
     * Acknowledge immediately and process out of band: an agent turn can outlast Telegram's
     * delivery timeout, and a slow 200 makes Telegram retry (and eventually drop the webhook).
     * Retries that do arrive are absorbed by the Redis update dedupe in `tools/telegram.ts`.
     */
    app.post(hook.path, (req, res) => {
      if (req.get("x-telegram-bot-api-secret-token") !== hook.secretToken) {
        logger.warn("rejected telegram webhook post with bad secret token");
        res.status(401).json({ error: "unauthorized" });
        return;
      }
      res.status(200).json({ ok: true });
      void hook.handleUpdate(req.body).catch((err: unknown) => {
        logger.error({ err: loggableError(err) }, "telegram webhook update failed");
      });
    });
    logger.info("telegram webhook route mounted");
  }

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

  /**
   * Internal trigger for schedulers (e.g. Kubernetes CronJob, Railway cron, n8n).
   * Auth: `Authorization: Bearer <MAGNUS_INTERNAL_JOB_SECRET>` or `X-Magnus-Job-Secret`.
   */
  app.post("/internal/jobs/morning-brief", async (req, res) => {
    const secret = morningBriefInternalSecret();
    const auth = typeof req.headers.authorization === "string" ? req.headers.authorization.trim() : "";
    const hdr =
      typeof req.headers["x-magnus-job-secret"] === "string"
        ? req.headers["x-magnus-job-secret"].trim()
        : "";
    if (!secret || (auth !== `Bearer ${secret}` && hdr !== secret)) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }

    const body = req.body as { userProfileId?: string } | undefined;
    const pid =
      typeof body?.userProfileId === "string" ? body.userProfileId.trim() : "";
    const fallback = process.env.MAGNUS_MORNING_BRIEF_DEFAULT_USER_PROFILE_ID?.trim() || "";
    const userProfileId = pid || fallback;
    if (!userProfileId) {
      res
        .status(400)
        .json({
          error:
            "missing userProfileId (JSON body) or MAGNUS_MORNING_BRIEF_DEFAULT_USER_PROFILE_ID",
        });
      return;
    }

    try {
      const { data: row, error } = await supabase
        .from("user_profile")
        .select("id, telegram_chat_id")
        .eq("id", userProfileId)
        .maybeSingle();

      if (error) {
        throw error;
      }
      if (!row?.telegram_chat_id) {
        res.status(404).json({ error: "profile not found or missing telegram_chat_id" });
        return;
      }

      const { sendMessage } = await import("./tools/telegram.js");
      const result = await runMorningBrief(
        {
          userProfileId: row.id,
          telegramUserId: row.telegram_chat_id,
          chatId: row.telegram_chat_id,
          now: new Date(),
          reason: "http",
        },
        { sendTelegram: sendMessage },
      );

      res.status(200).json({
        ok: true,
        skipped: result.skipped,
        notionPageId: result.notionPageId,
      });
    } catch (err) {
      logger.warn({ err: loggableError(err) }, "internal morning-brief job failed");
      res.status(500).json({ error: "job_failed" });
    }
  });

  const port = healthListenPort();
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
