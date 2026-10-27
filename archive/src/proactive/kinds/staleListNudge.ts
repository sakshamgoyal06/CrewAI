import { isInLocalHourWindow } from "../scheduleWindow.js";
import { gateAndCompose } from "../llm/gateAndCompose.js";
import {
  formatStaleListSummary,
  loadStaleListSnapshot,
} from "../signals/listNudgeSignals.js";
import type {
  ProactiveKindHandler,
  ProactiveEvaluateResult,
} from "./types.js";

const DEFAULT_STALE_DAYS = 14;
const DEFAULT_MIN_ITEMS = 2;
const DEFAULT_LOCAL_HOUR = 16;

function configNumber(config: Record<string, unknown>, key: string, fallback: number): number {
  const v = config[key];
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

export const staleListNudgeHandler: ProactiveKindHandler = {
  kind: "stale_list_nudge",
  capBucket: "adaptive",
  dedupeTtlSec: 259200,

  async evaluate(ctx): Promise<ProactiveEvaluateResult> {
    const localHour = configNumber(ctx.subscription.config, "localHour", DEFAULT_LOCAL_HOUR);
    const windowMinutes =
      configNumber(ctx.subscription.config, "windowMinutes", 14) || 14;
    const staleDays = configNumber(ctx.subscription.config, "staleDays", DEFAULT_STALE_DAYS);
    const minItems = configNumber(ctx.subscription.config, "minItems", DEFAULT_MIN_ITEMS);

    const inWindow = isInLocalHourWindow(ctx.signals.local, localHour, windowMinutes);
    if (!inWindow) {
      return { candidate: false, reason: "outside_window" };
    }

    const snapshot = await loadStaleListSnapshot({
      userProfileId: ctx.userProfileId,
      now: ctx.now,
      staleDays,
    });

    const candidate = snapshot.totalStale >= minItems;
    return {
      candidate,
      reason: candidate ? "stale_items_found" : "not_enough_stale_items",
      signals: {
        totalStale: snapshot.totalStale,
        minItems,
        staleDays,
        bySlug: snapshot.bySlug,
      },
    };
  },

  async llmGate(ctx, evalResult) {
    if (!evalResult.candidate) {
      return { send: false, skipReason: evalResult.reason };
    }

    const staleDays = configNumber(ctx.subscription.config, "staleDays", DEFAULT_STALE_DAYS);
    const snapshot = await loadStaleListSnapshot({
      userProfileId: ctx.userProfileId,
      now: ctx.now,
      staleDays,
    });
    const summary = formatStaleListSummary(snapshot);

    const result = await gateAndCompose({
      kind: "stale_list_nudge",
      systemPreamble:
        "You are Magnus nudging the user about queued joy/media items that have been sitting on their lists. Suggest picking one — warm, no guilt. Reference 1-2 specific titles when possible.",
      contextBlock: [
        `Kind: stale_list_nudge`,
        summary,
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
      "You've got a few things queued on your lists — want to pick one for tonight?"
    );
  },
};
