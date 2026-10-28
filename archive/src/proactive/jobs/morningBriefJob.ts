import { runMorningBrief } from "../../jobs/morningBrief.js";
import {
  morningBriefFeatureEnabled,
  morningBriefLocalHour,
  morningBriefWindowMinutes,
} from "../../jobs/morningBriefEnv.js";
import { getLocalTimeParts } from "../../jobs/morningBriefTime.js";
import { logger } from "../../logger.js";
import { claimProactiveDelivery } from "../dedupe.js";
import { isInLocalHourWindow } from "../scheduleWindow.js";
import { listAllowlistedTelegramTargets } from "../targets.js";
import type { ScheduledProactiveJob } from "./types.js";

function morningBriefCronJobEnabled(): boolean {
  if (!morningBriefFeatureEnabled()) {
    return false;
  }
  const legacy = process.env.MAGNUS_MORNING_BRIEF_CRON_ENABLED?.trim().toLowerCase();
  if (legacy === "false" || legacy === "0") {
    return false;
  }
  return true;
}

export const morningBriefScheduledJob: ScheduledProactiveJob = {
  id: "morning_brief",
  enabled: morningBriefCronJobEnabled,
  async run({ now }) {
    const targetHour = morningBriefLocalHour();
    const windowMin = morningBriefWindowMinutes();

    let targets;
    try {
      targets = await listAllowlistedTelegramTargets();
    } catch (err) {
      logger.warn({ err: String(err) }, "morning brief: user list failed");
      return;
    }

    for (const target of targets) {
      const parts = getLocalTimeParts(now, target.timezone);
      if (!isInLocalHourWindow(parts, targetHour, windowMin)) {
        continue;
      }

      const dedupeKey = `morning_brief:${target.userProfileId}:${parts.dateKey}`;
      const claimed = await claimProactiveDelivery(dedupeKey, 172800);
      if (!claimed) {
        continue;
      }

      try {
        await runMorningBrief(
          {
            userProfileId: target.userProfileId,
            telegramUserId: target.telegramChatId,
            chatId: target.telegramChatId,
            now,
            reason: "scheduled",
            deliverTelegram: true,
          },
          {},
        );
      } catch (err) {
        logger.error(
          { err: String(err), userProfileId: target.userProfileId },
          "morning brief scheduled run failed",
        );
      }
    }
  },
};
