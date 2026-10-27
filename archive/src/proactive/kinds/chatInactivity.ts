import { gateAndCompose } from "../llm/gateAndCompose.js";
import { loadChatInactivitySnapshot } from "../signals/inactivitySignals.js";
import type {
  ProactiveKindHandler,
  ProactiveEvaluateResult,
} from "./types.js";

const DEFAULT_INACTIVITY_DAYS = 3;
const DEFAULT_HOUR_START = 10;
const DEFAULT_HOUR_END = 20;

function configNumber(config: Record<string, unknown>, key: string, fallback: number): number {
  const v = config[key];
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function inDaytimeWindow(hour: number, start: number, end: number): boolean {
  return hour >= start && hour < end;
}

export const chatInactivityHandler: ProactiveKindHandler = {
  kind: "chat_inactivity",
  capBucket: "adaptive",
  dedupeTtlSec: 172800,

  async evaluate(ctx): Promise<ProactiveEvaluateResult> {
    const inactivityDays = configNumber(
      ctx.subscription.config,
      "inactivityDays",
      DEFAULT_INACTIVITY_DAYS,
    );
    const hourStart = configNumber(ctx.subscription.config, "localHourStart", DEFAULT_HOUR_START);
    const hourEnd = configNumber(ctx.subscription.config, "localHourEnd", DEFAULT_HOUR_END);

    if (!inDaytimeWindow(ctx.signals.local.hour, hourStart, hourEnd)) {
      return { candidate: false, reason: "outside_daytime_window" };
    }

    const inactivity = await loadChatInactivitySnapshot({
      userProfileId: ctx.userProfileId,
      telegramChatId: ctx.telegramChatId,
      now: ctx.now,
    });

    if (inactivity.daysSinceLastMessage == null) {
      return { candidate: false, reason: "no_chat_history" };
    }

    const candidate = inactivity.daysSinceLastMessage >= inactivityDays;
    return {
      candidate,
      reason: candidate ? "inactive_long_enough" : "recently_active",
      signals: {
        daysSinceLastMessage: inactivity.daysSinceLastMessage,
        inactivityDays,
        lastUserMessageAt: inactivity.lastUserMessageAt?.toISOString() ?? null,
      },
    };
  },

  async llmGate(ctx, evalResult) {
    if (!evalResult.candidate) {
      return { send: false, skipReason: evalResult.reason };
    }

    const inactivity = await loadChatInactivitySnapshot({
      userProfileId: ctx.userProfileId,
      telegramChatId: ctx.telegramChatId,
      now: ctx.now,
    });

    const result = await gateAndCompose({
      kind: "chat_inactivity",
      systemPreamble:
        "You are Magnus checking in after the user has been quiet for a few days. Warm, brief, no guilt. Offer one easy re-entry (log something, plan the day, or just say hi).",
      contextBlock: [
        `Kind: chat_inactivity`,
        `Days since last message: ${inactivity.daysSinceLastMessage ?? "unknown"}`,
        ctx.signals.userGraphSummary ? `User graph:\n${ctx.signals.userGraphSummary}` : "",
        ctx.signals.weeklyScheduleExcerpt
          ? `Weekly schedule excerpt:\n${ctx.signals.weeklyScheduleExcerpt.slice(0, 300)}`
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
      "Haven't heard from you in a bit — want a quick check-in or help planning today?"
    );
  },
};
