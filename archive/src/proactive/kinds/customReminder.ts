import { isOneShotReminderDeliverable } from "../oneShotReminderExpiry.js";
import { isInLocalHourWindow } from "../scheduleWindow.js";
import type { ProactiveEvaluateResult, ProactiveKindHandler } from "./types.js";
import {
  scheduleUntilDate,
  type IntervalLocalSchedule,
  type OneShotSchedule,
  type WeeklyLocalSchedule,
} from "../subscriptions/types.js";
import { recurringLocalSchedule } from "./recurringLocal.js";

/** Whole days between two YYYY-MM-DD local day keys. Negative when `to` precedes `from`. */
export function localDayDiff(from: string, to: string): number | null {
  const parse = (key: string): number | null => {
    const m = key.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) {
      return null;
    }
    return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  };
  const a = parse(from);
  const b = parse(to);
  if (a === null || b === null) {
    return null;
  }
  return Math.round((b - a) / 86_400_000);
}

function intervalLocalSchedule(ctx: {
  subscription: { schedule: unknown };
}): IntervalLocalSchedule | null {
  const s = ctx.subscription.schedule;
  if (s && typeof s === "object" && (s as IntervalLocalSchedule).type === "interval_local") {
    return s as IntervalLocalSchedule;
  }
  return null;
}

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
    const until = scheduleUntilDate(ctx.subscription.schedule);
    if (until && ctx.signals.local.dateKey > until) {
      return { candidate: false, reason: "past_until_date" };
    }

    const interval = intervalLocalSchedule(ctx);
    if (interval) {
      const diff = localDayDiff(interval.anchorDate, ctx.signals.local.dateKey);
      if (diff === null || diff < 0) {
        return { candidate: false, reason: "before_anchor" };
      }
      const every = Math.max(1, Math.floor(interval.intervalDays));
      if (diff % every !== 0) {
        return { candidate: false, reason: "off_interval_day" };
      }
      const inWindow = isInLocalHourWindow(
        ctx.signals.local,
        interval.localHour,
        interval.windowMinutes ?? 14,
      );
      return inWindow
        ? { candidate: true, reason: "interval_window" }
        : { candidate: false, reason: "outside_window" };
    }

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
    const at = new Date(sched.at);
    if (!isOneShotReminderDeliverable(at, ctx.now)) {
      if (Number.isNaN(at.getTime()) || at.getTime() > ctx.now.getTime()) {
        return { candidate: false, reason: "not_due" };
      }
      return { candidate: false, reason: "expired" };
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
