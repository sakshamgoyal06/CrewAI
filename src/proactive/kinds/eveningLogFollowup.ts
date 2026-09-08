/**
 * Gentle follow-up when the evening journal nudge was sent but no check-in yet.
 * Fires once ~22:00 local — only when evening_journal is enabled and session is still open.
 */
import { isInLocalHourWindow } from "../scheduleWindow.js";
import { getEveningJournalPending } from "../../logging/eveningJournalPending.js";
import { getSubscriptionByKind } from "../subscriptions/store.js";
import { gateAndCompose } from "../llm/gateAndCompose.js";
import type { ProactiveKindHandler, ProactiveEvaluateResult, ProactiveKindContext } from "./types.js";

const FOLLOWUP_HOUR = 22;
const FOLLOWUP_WINDOW_MIN = 45;

export const eveningLogFollowupHandler: ProactiveKindHandler = {
  kind: "evening_log_followup",
  capBucket: "adaptive",
  dedupeTtlSec: 86400,

  async evaluate(ctx): Promise<ProactiveEvaluateResult> {
    const eveningSub = await getSubscriptionByKind(ctx.userProfileId, "evening_journal");
    if (!eveningSub?.enabled) {
      return { candidate: false, reason: "evening_journal_disabled" };
    }

    const dailyLog = ctx.signals.dailyLog;
    if (dailyLog.hasEveningReflection || dailyLog.declinedEvening) {
      return { candidate: false, reason: "evening_already_logged_or_declined" };
    }

    const inWindow = isInLocalHourWindow(ctx.signals.local, FOLLOWUP_HOUR, FOLLOWUP_WINDOW_MIN);
    if (!inWindow) {
      return { candidate: false, reason: "outside_followup_window" };
    }

    const pending = await getEveningJournalPending(ctx.userProfileId);
    if (!pending || pending.dateKey !== ctx.signals.local.dateKey) {
      return { candidate: false, reason: "no_open_evening_session" };
    }
    if (pending.phase === "confirming" || pending.phase === "collecting") {
      return { candidate: false, reason: "user_already_engaged" };
    }

    const armedMs = Date.parse(pending.armedAt);
    const minWaitMs = 45 * 60 * 1000;
    if (Number.isFinite(armedMs) && ctx.now.getTime() - armedMs < minWaitMs) {
      return { candidate: false, reason: "too_soon_after_nudge" };
    }

    return {
      candidate: true,
      signals: {
        phase: pending.phase,
        armedAt: pending.armedAt,
      },
    };
  },

  async llmGate(ctx, evalResult) {
    if (!evalResult.candidate) {
      return { send: false, skipReason: evalResult.reason };
    }

    if (ctx.signals.recentUserChatSnippet.trim().length > 20) {
      return { send: false, skipReason: "user_recently_active" };
    }

    const result = await gateAndCompose({
      kind: "evening_log_followup",
      systemPreamble:
        "You are Magnus sending one gentle evening check-in follow-up. The user got an earlier nudge but hasn't logged yet. One short sentence — invite a quick rating or reflection. No guilt, no repeat of the full day summary.",
      contextBlock: [
        `Local time: ${ctx.signals.local.dateKey} ${ctx.signals.local.hour}:${ctx.signals.local.minute}`,
        `Morning intention: ${ctx.signals.dailyLog.morningIntention ?? "(none)"}`,
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
    return "Quick evening check-in when you have a moment — a 1–10 day rating or a line on how it felt is enough.";
  },
};
