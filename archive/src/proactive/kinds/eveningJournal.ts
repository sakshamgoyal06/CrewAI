import { isInLocalHourWindow } from "../scheduleWindow.js";
import type {
  ProactiveKindContext,
  ProactiveKindHandler,
  ProactiveEvaluateResult,
} from "./types.js";
import type { RecurringLocalSchedule } from "../subscriptions/types.js";
import { gateAndCompose } from "../llm/gateAndCompose.js";
import { buildDayRhythmSummary } from "../rhythm/daySummary.js";

function recurringSchedule(ctx: ProactiveKindContext): RecurringLocalSchedule | null {
  const s = ctx.subscription.schedule;
  if (s && typeof s === "object" && (s as RecurringLocalSchedule).type === "recurring_local") {
    return s as RecurringLocalSchedule;
  }
  return null;
}

export const eveningJournalHandler: ProactiveKindHandler = {
  kind: "evening_journal",
  capBucket: "scheduled",
  dedupeTtlSec: 172800,

  async evaluate(ctx): Promise<ProactiveEvaluateResult> {
    const sched = recurringSchedule(ctx);
    if (!sched) {
      return { candidate: false, reason: "invalid_schedule" };
    }
    const windowMin = sched.windowMinutes ?? 14;
    const inWindow = isInLocalHourWindow(ctx.signals.local, sched.localHour, windowMin);
    if (!inWindow) {
      return { candidate: false, reason: "outside_window" };
    }

    const daySummary = await buildDayRhythmSummary({
      userProfileId: ctx.userProfileId,
      timezone: ctx.timezone,
      dateKey: ctx.signals.local.dateKey,
      signals: ctx.signals,
    });

    const dailyLog = ctx.signals.dailyLog;
    if (!dailyLog.shouldNudgeEvening) {
      return {
        candidate: false,
        reason: dailyLog.hasEveningReflection
          ? "evening_already_logged"
          : dailyLog.declinedEvening
            ? "evening_declined_today"
            : "outside_evening_nudge_window",
      };
    }

    return {
      candidate: true,
      signals: {
        completeness: dailyLog.completeness,
        hasEveningReflection: dailyLog.hasEveningReflection,
        localHour: ctx.signals.local.hour,
        daySummaryText: daySummary.text,
        commitmentsDone: daySummary.done,
        commitmentsMissed: daySummary.missed,
      },
    };
  },

  async llmGate(ctx, evalResult) {
    if (ctx.signals.dailyLog.hasEveningReflection) {
      return { send: false, skipReason: "evening_already_logged" };
    }
    if (ctx.signals.dailyLog.declinedEvening) {
      return { send: false, skipReason: "evening_declined_today" };
    }

    const result = await gateAndCompose({
      kind: "evening_journal",
      systemPreamble:
        "You are Magnus sending an evening review. Start with a brief factual day summary from the data (commitments, meals, workout). Then ask 2–3 short questions max: how the day felt, joy 1–100 if unknown, anything worth remembering. Skip fields already captured in chat. No shame.",
      contextBlock: [
        `Kind: evening_journal`,
        `Local time: ${ctx.signals.local.dateKey} ${ctx.signals.local.hour}:${ctx.signals.local.minute}`,
        `Logging completeness: ${ctx.signals.dailyLog.completeness}`,
        `Evening reflection logged: ${ctx.signals.dailyLog.hasEveningReflection}`,
        evalResult.signals?.daySummaryText ?? "",
        `Recent user chat: ${ctx.signals.recentUserChatSnippet || "(none)"}`,
        evalResult.signals ? `Evaluate: ${JSON.stringify(evalResult.signals)}` : "",
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
    return "Evening review — how did today go? Reply when you want to log your check-in.";
  },
};
