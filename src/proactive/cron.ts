/**
 * In-process cron for Magnus-initiated Telegram messages (scheduled jobs).
 */
import cron from "node-cron";

import { proactiveCronEnabled, proactiveCronIntervalMinutes } from "./env.js";
import { scheduledProactiveJobs } from "./registry.js";
import { logger } from "../logger.js";

async function runProactiveCronTick(now: Date): Promise<void> {
  const jobs = scheduledProactiveJobs();
  for (const job of jobs) {
    if (!job.enabled()) {
      continue;
    }
    try {
      await job.run({ now });
    } catch (err) {
      logger.error({ err: String(err), jobId: job.id }, "proactive cron job failed");
    }
  }
}

export function scheduleProactiveCron(): void {
  if (!proactiveCronEnabled()) {
    logger.info(
      "proactive cron not scheduled (set MAGNUS_PROACTIVE_CRON_ENABLED=true or MAGNUS_MORNING_BRIEF_CRON_ENABLED=true)",
    );
    return;
  }

  const intervalMin = proactiveCronIntervalMinutes();
  const pattern =
    intervalMin === 1
      ? "* * * * *"
      : intervalMin <= 30
        ? `*/${intervalMin} * * * *`
        : "*/5 * * * *";

  cron.schedule(
    pattern,
    () => {
      void runProactiveCronTick(new Date()).catch((err) => {
        logger.error({ err: String(err) }, "proactive cron tick failed");
      });
    },
    { timezone: "UTC" },
  );

  const enabledJobs = scheduledProactiveJobs()
    .filter((j) => j.enabled())
    .map((j) => j.id);

  logger.info(
    { intervalMinutes: intervalMin, jobs: enabledJobs },
    "proactive cron scheduled (UTC; per-user timezone inside jobs)",
  );
}

/** Manual / test entry point. */
export async function runProactiveCronTickNow(): Promise<void> {
  await runProactiveCronTick(new Date());
}
