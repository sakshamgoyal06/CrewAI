import { isInLocalHourWindow } from "../scheduleWindow.js";
import type {
  ProactiveKindContext,
  ProactiveKindHandler,
  ProactiveEvaluateResult,
} from "./types.js";
import type { RecurringLocalSchedule } from "../subscriptions/types.js";
import { gateAndCompose } from "../llm/gateAndCompose.js";

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
    return {
      candidate: true,
      signals: {
        hasCheckinToday: ctx.signals.hasCheckinToday,
        localHour: ctx.signals.local.hour,
      },
    };
  },

  async llmGate(ctx, evalResult) {
    if (ctx.signals.hasCheckinToday) {
      return { send: false, skipReason: "checkin_already_logged" };
    }

    const result = await gateAndCompose({
      kind: "evening_journal",
      systemPreamble:
        "You are Magnus sending an evening journal nudge. Skip if the user already logged today or already reflected enough in chat.",
      contextBlock: [
        `Kind: evening_journal`,
        `Local time: ${ctx.signals.local.dateKey} ${ctx.signals.local.hour}:${ctx.signals.local.minute}`,
        `Check-in logged today: ${ctx.signals.hasCheckinToday}`,
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
    return "Evening check-in — how did today go? Reply when you want to log it.";
  },
};
