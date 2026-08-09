import { slotHour } from "../../nutrition/mealReminderSchedule.js";
import { gateAndCompose } from "../llm/gateAndCompose.js";
import type { ProactiveKindHandler, ProactiveEvaluateResult } from "./types.js";

const GRACE_HOURS = 1.5;

export const mealAdherenceNudgeHandler: ProactiveKindHandler = {
  kind: "meal_adherence_nudge",
  capBucket: "adaptive",
  dedupeTtlSec: 21600,

  async evaluate(ctx): Promise<ProactiveEvaluateResult> {
    const logged = new Set(ctx.signals.meals.mealsLoggedTodaySlots);
    const nowHour = ctx.signals.local.hour + ctx.signals.local.minute / 60;

    for (const slot of ctx.signals.meals.plannedSlotsMissedToday) {
      if (logged.has(slot)) {
        continue;
      }
      const plannedHour = slotHour(slot, ctx.signals.meals.slotHourOverrides);
      const title = ctx.signals.meals.plannedTitlesToday[slot];
      if (nowHour >= plannedHour + GRACE_HOURS && title) {
        return {
          candidate: true,
          signals: { slot, plannedTitle: title, plannedHour },
        };
      }
    }

    return { candidate: false, reason: "no_overdue_planned_slot" };
  },

  async llmGate(ctx, evalResult) {
    if (!evalResult.candidate) {
      return { send: false, skipReason: evalResult.reason };
    }

    const result = await gateAndCompose({
      kind: "meal_adherence_nudge",
      systemPreamble:
        "You are Magnus nudging about a planned meal that has not been logged yet. Offer to log it or mark skipped — supportive, not shameful.",
      contextBlock: [
        `Signals: ${JSON.stringify(evalResult.signals)}`,
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
    return "You had something planned that is not logged yet — want to log it or mark skipped?";
  },
};
