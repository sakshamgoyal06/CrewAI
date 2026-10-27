import type {
  ProactiveKindHandler,
  ProactiveEvaluateResult,
} from "./types.js";
import { gateAndCompose } from "../llm/gateAndCompose.js";

const DEFAULT_LATE_HOUR = 17;

export const driftGuardHandler: ProactiveKindHandler = {
  kind: "drift_guard",
  capBucket: "adaptive",
  dedupeTtlSec: 86400,

  async evaluate(ctx): Promise<ProactiveEvaluateResult> {
    const lateHour =
      typeof ctx.subscription.config.lateHour === "number"
        ? ctx.subscription.config.lateHour
        : DEFAULT_LATE_HOUR;

    const rules = {
      gymPlannedToday: ctx.signals.gymPlannedToday,
      workoutLoggedToday: ctx.signals.workoutLoggedToday,
      pastLateHour: ctx.signals.local.hour >= lateHour,
      hevyConnected: ctx.signals.hevyConnected,
    };

    const candidate =
      rules.gymPlannedToday && !rules.workoutLoggedToday && rules.pastLateHour;

    return {
      candidate,
      reason: candidate ? "gym_drift_rules_met" : "rules_not_met",
      signals: rules,
    };
  },

  async llmGate(ctx, evalResult) {
    if (!evalResult.candidate) {
      return { send: false, skipReason: evalResult.reason };
    }

    const tiredHint = /\b(tired|skip|might miss|exhausted|sleep)\b/i.test(
      ctx.signals.recentUserChatSnippet,
    );

    const result = await gateAndCompose({
      kind: "drift_guard",
      systemPreamble:
        "You are Magnus sending a gentle drift guard nudge before the user might miss a gym commitment. No guilt. Offer minimum show-up or intentional rest.",
      contextBlock: [
        `Kind: drift_guard`,
        `Rules fired: ${JSON.stringify(evalResult.signals)}`,
        `Recent user chat: ${ctx.signals.recentUserChatSnippet || "(none)"}`,
        `Tired/skip language in chat: ${tiredHint}`,
        ctx.signals.programWatchExcerpt
          ? `Health watch items:\n${ctx.signals.programWatchExcerpt}`
          : "",
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
    return (
      gateResult.composeHint?.trim() ||
      "Gym is on today's plan and it's getting late — minimum show-up still counts, or call an intentional rest day."
    );
  },
};
