import { isInLocalHourWindow } from "../scheduleWindow.js";
import { recurringLocalSchedule } from "./recurringLocal.js";
import type {
  ProactiveKindContext,
  ProactiveKindHandler,
  ProactiveEvaluateResult,
} from "./types.js";
import { gateAndCompose } from "../llm/gateAndCompose.js";
import { hasMorningOrientationToday } from "../rhythm/checkinRhythm.js";

export const morningOrientationHandler: ProactiveKindHandler = {
  kind: "morning_orientation",
  capBucket: "scheduled",
  dedupeTtlSec: 172800,

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

    const hasMorning = await hasMorningOrientationToday(
      ctx.userProfileId,
      ctx.signals.local.dateKey,
    );

    return {
      candidate: true,
      signals: {
        hasMorningOrientationToday: hasMorning,
        localHour: ctx.signals.local.hour,
      },
    };
  },

  async llmGate(ctx, evalResult) {
    if (evalResult.signals?.hasMorningOrientationToday) {
      return { send: false, skipReason: "morning_orientation_already_logged" };
    }
    if (ctx.signals.hasCheckinToday && ctx.signals.recentUserChatSnippet.trim()) {
      return { send: false, skipReason: "already_active_in_chat" };
    }

    const result = await gateAndCompose({
      kind: "morning_orientation",
      systemPreamble:
        "You are Magnus sending a brief morning orientation after the user may have read their brief. One optional question only — energy or the one thing that makes today a win. Skip if they already set intention in chat today.",
      contextBlock: [
        `Kind: morning_orientation`,
        `Local: ${ctx.signals.local.dateKey} ${ctx.signals.local.hour}:${ctx.signals.local.minute}`,
        `Gym planned today: ${ctx.signals.gymPlannedToday}`,
        `Recent chat: ${ctx.signals.recentUserChatSnippet || "(none)"}`,
        evalResult.signals ? `Evaluate: ${JSON.stringify(evalResult.signals)}` : "",
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
    return "Quick morning check — energy 1–5, or what's the one thing that would make today a win? Reply when you're ready.";
  },
};
