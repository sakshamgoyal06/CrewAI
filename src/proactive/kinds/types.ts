import type { ProactiveSignalSnapshot } from "../signals.js";
import type { ProactiveCapBucket } from "../subscriptions/types.js";
import type { ProactiveSubscription } from "../subscriptions/types.js";

export type ProactiveEvaluateResult = {
  candidate: boolean;
  reason?: string;
  signals?: Record<string, unknown>;
};

export type ProactiveGateResult = {
  send: boolean;
  skipReason?: string;
  composeHint?: string;
};

export type ProactiveKindContext = {
  now: Date;
  userProfileId: string;
  telegramChatId: string;
  timezone: string;
  subscription: ProactiveSubscription;
  signals: ProactiveSignalSnapshot;
};

export type ProactiveKindHandler = {
  kind: string;
  capBucket: ProactiveCapBucket;
  /** Dedupe TTL in seconds after a successful send. */
  dedupeTtlSec: number;

  evaluate(ctx: ProactiveKindContext): Promise<ProactiveEvaluateResult>;

  llmGate(
    ctx: ProactiveKindContext,
    evalResult: ProactiveEvaluateResult,
  ): Promise<ProactiveGateResult>;

  compose(ctx: ProactiveKindContext, gateResult: ProactiveGateResult): Promise<string>;
};

export type ProactiveMessageKind =
  | "evening_journal"
  | "week_planning"
  | "weekly_wrap"
  | "monthly_goal_review"
  | "drift_guard"
  | "custom_reminder"
  | "midday_encouragement"
  | "stale_list_nudge"
  | "chat_inactivity"
  | "meal_log_reminder"
  | "meal_adherence_nudge"
  | "meal_eod_reconciliation"
  | "meal_gap_nudge"
  | "weekly_nutrition_review";
