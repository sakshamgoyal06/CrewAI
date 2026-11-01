import { gateAndCompose } from "../llm/gateAndCompose.js";
import type { ProactiveKindHandler, ProactiveEvaluateResult } from "./types.js";

export const mealGapNudgeHandler: ProactiveKindHandler = {
  kind: "meal_gap_nudge",
  capBucket: "adaptive",
  dedupeTtlSec: 10800,

  async evaluate(ctx): Promise<ProactiveEvaluateResult> {
    if (ctx.signals.local.hour >= 23 || ctx.signals.local.hour < 6) {
      return { candidate: false, reason: "quiet_hours" };
    }

    const hoursSinceLog = ctx.signals.meals.lastMealLogAt
      ? (ctx.signals.now.getTime() - new Date(ctx.signals.meals.lastMealLogAt).getTime()) /
        (60 * 60 * 1000)
      : Infinity;

    const eatingMention = ctx.signals.meals.recentEatingChatWithoutLog;
    const longGap =
      hoursSinceLog >= 3 &&
      hoursSinceLog < 12 &&
      ctx.signals.meals.caloriesSoFarToday > 0 &&
      ctx.signals.local.hour >= 10 &&
      ctx.signals.local.hour <= 22;

    const candidate = eatingMention || longGap;
    if (!candidate) {
      return { candidate: false, reason: "no_gap_signal" };
    }

    return {
      candidate: true,
      signals: {
        eatingMention,
        longGap,
        hoursSinceLog,
        caloriesSoFar: ctx.signals.meals.caloriesSoFarToday,
      },
    };
  },

  async llmGate(ctx, evalResult) {
    if (!evalResult.candidate) {
      return { send: false, skipReason: evalResult.reason };
    }

    if (/\b(don't track|dont track|not tracking|skip logging)\b/i.test(ctx.signals.recentUserChatSnippet)) {
      return { send: false, skipReason: "user_opted_out" };
    }

    const result = await gateAndCompose({
      kind: "meal_gap_nudge",
      systemPreamble:
        "You are Magnus gently inviting a snack or meal log so today's total stays honest. Never shame eating — only complete the log. One sentence + optional log snack: example.",
      contextBlock: [
        `Signals: ${JSON.stringify(evalResult.signals)}`,
        `Recent chat: ${ctx.signals.recentUserChatSnippet || "(none)"}`,
      ].join("\n"),
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
    return "Sounds like you may have eaten — want to log it roughly so today's total stays honest? Even `log snack: …` is fine.";
  },
};
