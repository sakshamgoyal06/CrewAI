/**
 * In-process cron: checks allowlisted users every 15 minutes against local hour + window.
 */
import cron from "node-cron";

import {
  morningBriefCronEnabled,
  morningBriefFeatureEnabled,
  morningBriefLocalHour,
  morningBriefWindowMinutes,
} from "./morningBriefEnv.js";
import { runMorningBrief } from "./morningBrief.js";
import { getLocalTimeParts, isInMorningBriefWindow } from "./morningBriefTime.js";
import { logger } from "../logger.js";
import { redis, supabase } from "../tools/clients.js";

async function runScheduledMorningBriefsForAllUsers(
  targetHour: number,
  windowMinutes: number,
): Promise<void> {
  const now = new Date();
  const { data: users, error } = await supabase
    .from("user_profile")
    .select("id, telegram_chat_id, timezone")
    .eq("allowlisted", true)
    .not("telegram_chat_id", "is", null);

  if (error) {
    logger.warn({ err: error.message }, "morning brief user list failed");
    return;
  }
  if (!users?.length) {
    return;
  }

  const { sendMessage } = await import("../tools/telegram.js");

  for (const row of users) {
    const tid = row.telegram_chat_id as string;
    const tz =
      (typeof row.timezone === "string" && row.timezone.trim()) || "Asia/Kolkata";
    const parts = getLocalTimeParts(now, tz);
    if (!isInMorningBriefWindow(parts, targetHour, windowMinutes)) {
      continue;
    }

    const key = `morning_brief:${row.id}:${parts.dateKey}`;
    const acq = await redis.set(key, "1", { nx: true, ex: 172800 });
    if (!acq) {
      continue;
    }

    try {
      await runMorningBrief(
        {
          userProfileId: row.id,
          telegramUserId: tid,
          chatId: tid,
          now,
          reason: "scheduled",
        },
        { sendTelegram: sendMessage },
      );
    } catch (err) {
      logger.error({ err: String(err), userProfileId: row.id }, "morning brief scheduled run failed");
    }
  }
}

export function scheduleMorningBriefCron(): void {
  if (!morningBriefFeatureEnabled()) {
    logger.info("morning brief cron not scheduled (MAGNUS_MORNING_BRIEF_ENABLED=false)");
    return;
  }
  if (!morningBriefCronEnabled()) {
    logger.info(
      "morning brief cron not scheduled (set MAGNUS_MORNING_BRIEF_CRON_ENABLED=true to enable)",
    );
    return;
  }

  const hour = morningBriefLocalHour();
  const windowMin = morningBriefWindowMinutes();

  cron.schedule(
    "*/15 * * * *",
    () => {
      void runScheduledMorningBriefsForAllUsers(hour, windowMin).catch((err) => {
        logger.error({ err: String(err) }, "morning brief cron tick failed");
      });
    },
    { timezone: "UTC" },
  );

  logger.info(
    { localHour: hour, windowMinutes: windowMin },
    "morning brief cron scheduled (UTC */15; users filtered by profile timezone)",
  );
}
