import { logger } from "../../logger.js";
import { getLocalTimeParts } from "../../jobs/morningBriefTime.js";
import { recomputeDailyRollup } from "../../nutrition/store/mealRollupStore.js";
import { syncNutritionProgramMemory } from "../../nutrition/analytics/nutritionProgramMemory.js";
import { claimProactiveDelivery } from "../dedupe.js";
import { nutritionNightlyJobEnabled } from "../env.js";
import { isInLocalHourWindow } from "../scheduleWindow.js";
import { listAllowlistedTelegramTargets } from "../targets.js";
import type { ScheduledProactiveJob } from "./types.js";

const EOD_LOCAL_HOUR = 23;
const EOD_WINDOW_MINUTES = 30;

export const nutritionNightlyScheduledJob: ScheduledProactiveJob = {
  id: "nutrition_nightly",
  enabled: nutritionNightlyJobEnabled,
  async run({ now }) {
    let targets;
    try {
      targets = await listAllowlistedTelegramTargets();
    } catch (err) {
      logger.warn({ err: String(err) }, "nutrition nightly: user list failed");
      return;
    }

    for (const target of targets) {
      const parts = getLocalTimeParts(now, target.timezone);
      if (!isInLocalHourWindow(parts, EOD_LOCAL_HOUR, EOD_WINDOW_MINUTES)) {
        continue;
      }

      const dedupeKey = `nutrition_nightly:${target.userProfileId}:${parts.dateKey}`;
      const claimed = await claimProactiveDelivery(dedupeKey, 86400);
      if (!claimed) {
        continue;
      }

      try {
        const rollup = await recomputeDailyRollup(target.userProfileId, parts.dateKey);
        if (!rollup.ok) {
          logger.warn(
            { userProfileId: target.userProfileId, dateKey: parts.dateKey, error: rollup.error },
            "nutrition nightly: rollup failed",
          );
          continue;
        }

        await syncNutritionProgramMemory(target.userProfileId, parts.dateKey);
      } catch (err) {
        logger.error(
          { err: String(err), userProfileId: target.userProfileId },
          "nutrition nightly job failed",
        );
      }
    }
  },
};
