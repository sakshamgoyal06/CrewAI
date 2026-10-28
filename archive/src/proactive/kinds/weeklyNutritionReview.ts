import { isInLocalHourWindow } from "../scheduleWindow.js";
import { recurringLocalSchedule } from "./recurringLocal.js";
import {
  formatWeeklyNutritionSummary,
  loadWeeklyNutritionSummary,
} from "../../nutrition/analytics/weeklyNutritionSummary.js";
import { gateAndCompose } from "../llm/gateAndCompose.js";
import type { ProactiveKindHandler, ProactiveEvaluateResult } from "./types.js";

export const weeklyNutritionReviewHandler: ProactiveKindHandler = {
  kind: "weekly_nutrition_review",
  capBucket: "scheduled",
  dedupeTtlSec: 604800,

  async evaluate(ctx): Promise<ProactiveEvaluateResult> {
    const sched = recurringLocalSchedule(ctx);
    if (!sched) {
      return { candidate: false, reason: "invalid_schedule" };
    }

    const weekday = new Intl.DateTimeFormat("en-US", {
      timeZone: ctx.timezone,
      weekday: "short",
    })
      .format(ctx.now)
      .toLowerCase()
      .slice(0, 3);
    if (weekday !== "sun") {
      return { candidate: false, reason: "not_sunday" };
    }

    const inWindow = isInLocalHourWindow(ctx.signals.local, sched.localHour, sched.windowMinutes ?? 20);
    if (!inWindow) {
      return { candidate: false, reason: "outside_window" };
    }

    const summary = await loadWeeklyNutritionSummary(ctx.userProfileId, ctx.signals.local.dateKey);
    if (!summary || summary.daysLogged === 0) {
      return { candidate: false, reason: "insufficient_nutrition_data" };
    }

    return {
      candidate: true,
      signals: {
        summary,
        summaryText: formatWeeklyNutritionSummary(summary),
      },
    };
  },

  async llmGate(ctx, evalResult) {
    if (!evalResult.candidate) {
      return { send: false, skipReason: evalResult.reason };
    }

    const result = await gateAndCompose({
      kind: "weekly_nutrition_review",
      systemPreamble:
        "You are Magnus sending a brief weekly nutrition review. Highlight one win and one gentle focus for next week. No shame, no diet policing.",
      contextBlock: [
        `Weekly summary:\n${evalResult.signals?.summaryText ?? ""}`,
        `Calories today: ${ctx.signals.meals.caloriesSoFarToday}`,
        `Recent chat: ${ctx.signals.recentUserChatSnippet || "(none)"}`,
      ].join("\n"),
      userInstruction: ctx.subscription.userInstruction,
    });

    return {
      send: result.send,
      skipReason: result.skipReason,
      composeHint: result.send ? result.message : undefined,
    };
  },

  async compose(_ctx, gateResult) {
    if (gateResult.composeHint?.trim()) {
      return gateResult.composeHint.trim();
    }
    return "Weekly nutrition check-in — want a quick recap of how eating went this week?";
  },
};
