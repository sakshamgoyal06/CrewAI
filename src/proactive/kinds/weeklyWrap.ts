import { isInLocalHourWindow } from "../scheduleWindow.js";
import { recurringLocalSchedule } from "./recurringLocal.js";
import type {
  ProactiveKindContext,
  ProactiveKindHandler,
  ProactiveEvaluateResult,
} from "./types.js";
import { gateAndCompose } from "../llm/gateAndCompose.js";
import { isLocalWeekday } from "../rhythm/localWeekday.js";
import { buildWeekRhythmSummary } from "../rhythm/weekSummary.js";

export const weeklyWrapHandler: ProactiveKindHandler = {
  kind: "weekly_wrap",
  capBucket: "scheduled",
  dedupeTtlSec: 604800,

  async evaluate(ctx): Promise<ProactiveEvaluateResult> {
    if (!isLocalWeekday(ctx.now, ctx.timezone, "fri")) {
      return { candidate: false, reason: "not_friday" };
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
        joyTrend: summary.joyTrend,
      },
    };
  },

  async llmGate(ctx, evalResult) {
    if (!evalResult.candidate) {
      return { send: false, skipReason: evalResult.reason };
    }

    const result = await gateAndCompose({
      kind: "weekly_wrap",
      systemPreamble:
        "You are Magnus sending a Friday weekly wrap-up. Summarize the week from the data (commitments, check-ins, nutrition if present). Ask one win and one slip — pattern or one-off. Invite a small adjustment for next week. Warm, no shame.",
      contextBlock: [
        evalResult.signals?.weekSummaryText ?? "",
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
    return "Friday wrap — one win from this week, and what slipped (pattern or one-off)? I'll help you adjust for Monday.";
  },
};
