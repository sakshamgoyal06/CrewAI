import { isInLocalHourWindow } from "../scheduleWindow.js";
import { recurringLocalSchedule } from "./recurringLocal.js";
import { slotLabel, type PlannedMealSlot } from "../../nutrition/mealReminderSchedule.js";
import { gateAndCompose } from "../llm/gateAndCompose.js";
import type { ProactiveKindHandler, ProactiveEvaluateResult } from "./types.js";

export const mealEodReconciliationHandler: ProactiveKindHandler = {
  kind: "meal_eod_reconciliation",
  capBucket: "scheduled",
  dedupeTtlSec: 86400,

  async evaluate(ctx): Promise<ProactiveEvaluateResult> {
    const sched = recurringLocalSchedule(ctx);
    if (!sched) {
      return { candidate: false, reason: "invalid_schedule" };
    }
    const inWindow = isInLocalHourWindow(ctx.signals.local, sched.localHour, sched.windowMinutes ?? 20);
    if (!inWindow) {
      return { candidate: false, reason: "outside_window" };
    }

    const missed = ctx.signals.meals.plannedSlotsMissedToday;
    if (!missed.length) {
      return { candidate: false, reason: "all_planned_logged_or_none" };
    }

    return {
      candidate: true,
      signals: {
        missedSlots: missed,
        titles: ctx.signals.meals.plannedTitlesToday,
      },
    };
  },

  async llmGate(ctx, evalResult) {
    if (!evalResult.candidate) {
      return { send: false, skipReason: evalResult.reason };
    }

    const result = await gateAndCompose({
      kind: "meal_eod_reconciliation",
      systemPreamble:
        "You are Magnus offering a quick end-of-day meal catch-up. List unlogged planned slots briefly; invite log or skip. No guilt.",
      contextBlock: [
        `Missed planned slots: ${JSON.stringify(evalResult.signals)}`,
        `Calories today: ${ctx.signals.meals.caloriesSoFarToday}`,
      ].join("\n"),
      userInstruction: ctx.subscription.userInstruction,
    });

    return {
      send: result.send,
      skipReason: result.skipReason,
      composeHint: result.send ? result.message : undefined,
    };
  },

  async compose(ctx, gateResult) {
    if (gateResult.composeHint?.trim()) {
      return gateResult.composeHint.trim();
    }
    const missed = ctx.signals.meals.plannedSlotsMissedToday;
    const labels = missed.map((s) => slotLabel(s as PlannedMealSlot)).join(", ");
    return `End-of-day check — still unlogged: ${labels}. Quick catch-up with \`log …\` or say skip.`;
  },
};
