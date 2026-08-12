import { isInLocalHourWindow } from "../scheduleWindow.js";
import { recurringLocalSchedule } from "./recurringLocal.js";
import type {
  ProactiveKindContext,
  ProactiveKindHandler,
  ProactiveEvaluateResult,
} from "./types.js";
import { gateAndCompose } from "../llm/gateAndCompose.js";
import { isFirstDayOfMonth } from "../rhythm/localWeekday.js";
import { buildMonthRhythmSummary } from "../rhythm/monthSummary.js";

export const monthlyGoalReviewHandler: ProactiveKindHandler = {
  kind: "monthly_goal_review",
  capBucket: "scheduled",
  dedupeTtlSec: 2592000,

  async evaluate(ctx): Promise<ProactiveEvaluateResult> {
    if (!isFirstDayOfMonth(ctx.now, ctx.timezone)) {
      return { candidate: false, reason: "not_first_of_month" };
    }

    const sched = recurringLocalSchedule(ctx);
    if (!sched) {
      return { candidate: false, reason: "invalid_schedule" };
    }
    const inWindow = isInLocalHourWindow(
      ctx.signals.local,
      sched.localHour,
      sched.windowMinutes ?? 30,
    );
    if (!inWindow) {
      return { candidate: false, reason: "outside_window" };
    }

    const summary = await buildMonthRhythmSummary({
      userProfileId: ctx.userProfileId,
      dateKey: ctx.signals.local.dateKey,
    });

    return {
      candidate: true,
      signals: {
        monthSummaryText: summary.text,
        monthKey: summary.monthKey,
      },
    };
  },

  async llmGate(ctx, evalResult) {
    if (!evalResult.candidate) {
      return { send: false, skipReason: evalResult.reason };
    }

    const result = await gateAndCompose({
      kind: "monthly_goal_review",
      systemPreamble:
        "You are Magnus sending a monthly goal and progress review. Synthesize goals, projects, commitment rhythm, and joy trend. Ask if goals are still right — drop, defer, or escalate. Longer than daily nudges but still Telegram-friendly chunks.",
      contextBlock: [
        evalResult.signals?.monthSummaryText ?? "",
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
    return "Monthly check-in — are your goals still the right ones? What should we drop, defer, or push harder on this month?";
  },
};
