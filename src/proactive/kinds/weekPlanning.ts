import { isInLocalHourWindow } from "../scheduleWindow.js";
import { recurringLocalSchedule } from "./recurringLocal.js";
import type {
  ProactiveKindHandler,
  ProactiveEvaluateResult,
} from "./types.js";
import { gateAndCompose } from "../llm/gateAndCompose.js";
import { isLocalWeekday } from "../rhythm/localWeekday.js";
import { buildWeekRhythmSummary } from "../rhythm/weekSummary.js";

export const weekPlanningHandler: ProactiveKindHandler = {
  kind: "week_planning",
  capBucket: "scheduled",
  dedupeTtlSec: 604800,

  async evaluate(ctx): Promise<ProactiveEvaluateResult> {
    if (!isLocalWeekday(ctx.now, ctx.timezone, "mon")) {
      return { candidate: false, reason: "not_monday" };
    }

    const sched = recurringLocalSchedule(ctx);
    if (!sched) {
      return { candidate: false, reason: "invalid_schedule" };
    }
    const inWindow = isInLocalHourWindow(
      ctx.signals.local,
      sched.localHour,
      sched.windowMinutes ?? 20,
    );
    if (!inWindow) {
      return { candidate: false, reason: "outside_window" };
    }

    const summary = await buildWeekRhythmSummary({
      userProfileId: ctx.userProfileId,
      endDateKey: ctx.signals.local.dateKey,
    });

    return {
      candidate: true,
      signals: {
        weekSummaryText: summary.text,
        checkinCount: summary.checkinCount,
      },
    };
  },

  async llmGate(ctx, evalResult) {
    if (!evalResult.candidate) {
      return { send: false, skipReason: evalResult.reason };
    }

    const result = await gateAndCompose({
      kind: "week_planning",
      systemPreamble:
        "You are Magnus on Monday morning helping the user plan the week. Reference last week's rhythm briefly. Ask for top 3 priorities and what to lock on the calendar. No shame. Keep it short for Telegram.",
      contextBlock: [
        evalResult.signals?.weekSummaryText ?? "",
        `Gym schedule excerpt:\n${ctx.signals.weeklyScheduleExcerpt || "(none)"}`,
        `Recent chat: ${ctx.signals.recentUserChatSnippet || "(none)"}`,
        ctx.signals.userGraphSummary ? `User graph:\n${ctx.signals.userGraphSummary}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
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
    return "Monday planning — what are your top 3 priorities this week? Tell me what to lock on the calendar.";
  },
};
