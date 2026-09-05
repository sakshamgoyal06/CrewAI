import { isInLocalHourWindow } from "../scheduleWindow.js";
import type { ProactiveEvaluateResult, ProactiveKindHandler } from "./types.js";
import type { OneShotSchedule, WeeklyLocalSchedule } from "../subscriptions/types.js";
import { recurringLocalSchedule } from "./recurringLocal.js";

function localDayOfWeek(now: Date, timezone: string): number {
  const short = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short" })
    .format(now)
    .toLowerCase()
    .slice(0, 3);
  const map: Record<string, number> = {
    sun: 0,
    mon: 1,
    tue: 2,
    wed: 3,
    thu: 4,
    fri: 5,
    sat: 6,
  };
  return map[short] ?? now.getUTCDay();
}

function weeklyLocalSchedule(ctx: {
  subscription: { schedule: unknown };
}): WeeklyLocalSchedule | null {
  const s = ctx.subscription.schedule;
  if (s && typeof s === "object" && (s as WeeklyLocalSchedule).type === "weekly_local") {
    return s as WeeklyLocalSchedule;
  }
  return null;
}

export const customReminderHandler: ProactiveKindHandler = {
  kind: "custom_reminder",
  capBucket: "user_asked",
  dedupeTtlSec: 3600,

  async evaluate(ctx): Promise<ProactiveEvaluateResult> {
    const weekly = weeklyLocalSchedule(ctx);
    if (weekly) {
      const dow = localDayOfWeek(ctx.now, ctx.timezone);
      if (!weekly.daysOfWeek.includes(dow)) {
        return { candidate: false, reason: "wrong_weekday" };
      }
      const minute = weekly.localMinute ?? 0;
      if (ctx.signals.local.hour !== weekly.localHour || ctx.signals.local.minute < minute) {
        return { candidate: false, reason: "outside_window" };
      }
      const inWindow = isInLocalHourWindow(
        ctx.signals.local,
        weekly.localHour,
        weekly.windowMinutes ?? 14,
      );
      return inWindow
        ? { candidate: true, reason: "weekly_window" }
        : { candidate: false, reason: "outside_window" };
    }

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

  async compose(_ctx, gateResult) {
    return gateResult.composeHint?.trim() || "Reminder";
  },
};
