import type {
  ProactiveKindContext,
  ProactiveKindHandler,
  ProactiveEvaluateResult,
} from "./types.js";
import type { OneShotSchedule } from "../subscriptions/types.js";

export const customReminderHandler: ProactiveKindHandler = {
  kind: "custom_reminder",
  capBucket: "user_asked",
  dedupeTtlSec: 3600,

  async evaluate(ctx): Promise<ProactiveEvaluateResult> {
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
