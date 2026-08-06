import { isInLocalHourWindow } from "../scheduleWindow.js";
import type {
  ProactiveKindContext,
  ProactiveKindHandler,
  ProactiveEvaluateResult,
} from "./types.js";
import type { OneShotSchedule, RecurringLocalSchedule } from "../subscriptions/types.js";
import { recurringLocalSchedule } from "./recurringLocal.js";

export const customReminderHandler: ProactiveKindHandler = {
  kind: "custom_reminder",
  capBucket: "user_asked",
  dedupeTtlSec: 3600,

  async evaluate(ctx): Promise<ProactiveEvaluateResult> {
    const recurring = recurringLocalSchedule(ctx);
    if (recurring) {
      const inWindow = isInLocalHourWindow(
        ctx.signals.local,
        recurring.localHour,
        recurring.windowMinutes ?? 14,
      );
      return inWindow
        ? { candidate: true, reason: "recurring_window" }
        : { candidate: false, reason: "outside_window" };
    }

    const sched = ctx.subscription.schedule as OneShotSchedule;
    if (sched?.type !== "one_shot" || !sched.at) {
      return { candidate: false, reason: "invalid_schedule" };
    }
    const at = new Date(sched.at).getTime();
    if (Number.isNaN(at) || at > ctx.now.getTime()) {
      return { candidate: false, reason: "not_due" };
    }
    return { candidate: true, reason: "due" };
  },

  async llmGate(ctx) {
    const message =
      (typeof ctx.subscription.config.message === "string" &&
        ctx.subscription.config.message.trim()) ||
      ctx.subscription.userInstruction?.trim() ||
      "Reminder";
    return { send: true, composeHint: message };
  },

  async compose(ctx, gateResult) {
    return gateResult.composeHint?.trim() || "Reminder";
  },
};
