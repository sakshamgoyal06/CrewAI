import { isInLocalHourWindow } from "../scheduleWindow.js";
import { gateAndCompose } from "../llm/gateAndCompose.js";
import { recurringLocalSchedule } from "./recurringLocal.js";
import type {
  ProactiveKindHandler,
  ProactiveEvaluateResult,
} from "./types.js";

export const middayEncouragementHandler: ProactiveKindHandler = {
  kind: "midday_encouragement",
  capBucket: "adaptive",
  dedupeTtlSec: 86400,

  async evaluate(ctx): Promise<ProactiveEvaluateResult> {
    const sched = recurringLocalSchedule(ctx);
    if (!sched) {
      return { candidate: false, reason: "invalid_schedule" };
    }
    const inWindow = isInLocalHourWindow(
      ctx.signals.local,
      sched.localHour,
      sched.windowMinutes ?? 14,
    );
    if (!inWindow) {
      return { candidate: false, reason: "outside_window" };
    }
    return {
      candidate: true,
      signals: { localHour: ctx.signals.local.hour },
    };
  },

  async llmGate(ctx, evalResult) {
    const result = await gateAndCompose({
      kind: "midday_encouragement",
      systemPreamble:
        "You are Magnus sending a brief midday encouragement. Reference the user's goals or recent wins when available. Warm, not cheesy. No new tasks — one grounding line.",
      contextBlock: [
        `Kind: midday_encouragement`,
        `Local: ${ctx.signals.local.dateKey} ${ctx.signals.local.hour}:${ctx.signals.local.minute}`,
        evalResult.signals ? `Signals: ${JSON.stringify(evalResult.signals)}` : "",
        ctx.signals.userGraphSummary ? `User graph:\n${ctx.signals.userGraphSummary}` : "",
        ctx.signals.recentUserChatSnippet
          ? `Recent chat: ${ctx.signals.recentUserChatSnippet}`
          : "",
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
    return (
      gateResult.composeHint?.trim() ||
      "Midday check-in — you're making progress. Keep one thing in focus this afternoon."
    );
  },
};
