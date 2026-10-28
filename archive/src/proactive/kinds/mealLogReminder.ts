import { isInLocalHourWindow } from "../scheduleWindow.js";
import {
  slotHour,
  slotLabel,
  type PlannedMealSlot,
} from "../../nutrition/mealReminderSchedule.js";
import { gateAndCompose } from "../llm/gateAndCompose.js";
import type { ProactiveKindHandler, ProactiveEvaluateResult, ProactiveKindContext } from "./types.js";

const REMINDER_SLOTS: PlannedMealSlot[] = ["breakfast", "lunch", "dinner"];

function reminderSlot(ctx: ProactiveKindContext): PlannedMealSlot | null {
  const logged = new Set(ctx.signals.meals.mealsLoggedTodaySlots);
  const windowMin =
    typeof ctx.subscription.config.windowMinutes === "number"
      ? ctx.subscription.config.windowMinutes
      : 30;

  for (const slot of REMINDER_SLOTS) {
    if (logged.has(slot)) {
      continue;
    }
    const hour = slotHour(slot, ctx.signals.meals.slotHourOverrides);
    if (isInLocalHourWindow(ctx.signals.local, hour, windowMin)) {
      return slot;
    }
  }
  return null;
}

export const mealLogReminderHandler: ProactiveKindHandler = {
  kind: "meal_log_reminder",
  capBucket: "scheduled",
  dedupeTtlSec: 14400,

  async evaluate(ctx): Promise<ProactiveEvaluateResult> {
    const slot = reminderSlot(ctx);
    if (!slot) {
      return { candidate: false, reason: "no_slot_in_window_or_already_logged" };
    }
    return {
      candidate: true,
      signals: { slot, hour: slotHour(slot, ctx.signals.meals.slotHourOverrides) },
    };
  },

  async llmGate(ctx, evalResult) {
    if (!evalResult.candidate) {
      return { send: false, skipReason: evalResult.reason };
    }
    const slot = evalResult.signals?.slot as PlannedMealSlot | undefined;
    if (!slot) {
      return { send: false, skipReason: "no_slot" };
    }

    const result = await gateAndCompose({
      kind: "meal_log_reminder",
      systemPreamble:
        "You are Magnus sending a gentle meal-log reminder. Invite the user to log when done — no guilt, no diet policing. Mention the slot name. Keep it one short sentence plus a log hint like log lunch: …",
      contextBlock: [
        `Slot: ${slot}`,
        `Calories so far today: ${ctx.signals.meals.caloriesSoFarToday}`,
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

  async compose(ctx, gateResult) {
    if (gateResult.composeHint?.trim()) {
      return gateResult.composeHint.trim();
    }
    const slot = reminderSlot(ctx) ?? "lunch";
    return `${slotLabel(slot)} window — log when you're done? e.g. \`log ${slot}: …\``;
  },
};
