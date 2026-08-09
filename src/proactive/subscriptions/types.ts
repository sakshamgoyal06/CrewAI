/**
 * Proactive subscription rows — per-user opt-in for automated Telegram messages.
 */

export type ProactiveTriggerType = "one_shot" | "recurring" | "conditional";

export type ProactiveCapBucket = "scheduled" | "user_asked" | "adaptive";

export type ProactiveSubscriptionSource = "system_default" | "user_chat";

export type RecurringLocalSchedule = {
  type: "recurring_local";
  localHour: number;
  windowMinutes?: number;
};

export type OneShotSchedule = {
  type: "one_shot";
  at: string;
};

export type ConditionalSchedule = {
  type: "conditional";
};

export type ProactiveSchedule =
  | RecurringLocalSchedule
  | OneShotSchedule
  | ConditionalSchedule
  | Record<string, unknown>;

export type ProactiveSubscriptionRow = {
  id: string;
  user_profile_id: string;
  kind: string;
  enabled: boolean;
  trigger_type: ProactiveTriggerType;
  schedule: ProactiveSchedule;
  config: Record<string, unknown>;
  user_instruction: string | null;
  source: ProactiveSubscriptionSource;
  cap_bucket: ProactiveCapBucket;
  cooldown_hours: number | null;
  last_sent_at: string | null;
  next_fire_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ProactiveSubscription = {
  id: string;
  userProfileId: string;
  kind: string;
  enabled: boolean;
  triggerType: ProactiveTriggerType;
  schedule: ProactiveSchedule;
  config: Record<string, unknown>;
  userInstruction: string | null;
  source: ProactiveSubscriptionSource;
  capBucket: ProactiveCapBucket;
  cooldownHours: number | null;
  lastSentAt: string | null;
  nextFireAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export function rowToSubscription(row: ProactiveSubscriptionRow): ProactiveSubscription {
  return {
    id: row.id,
    userProfileId: row.user_profile_id,
    kind: row.kind,
    enabled: row.enabled,
    triggerType: row.trigger_type,
    schedule: row.schedule ?? {},
    config: row.config ?? {},
    userInstruction: row.user_instruction,
    source: row.source,
    capBucket: row.cap_bucket,
    cooldownHours: row.cooldown_hours,
    lastSentAt: row.last_sent_at,
    nextFireAt: row.next_fire_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const CATALOG_KINDS = [
  "evening_journal",
  "drift_guard",
  "midday_encouragement",
  "stale_list_nudge",
  "chat_inactivity",
  "meal_log_reminder",
  "meal_adherence_nudge",
  "meal_eod_reconciliation",
  "meal_gap_nudge",
  "weekly_nutrition_review",
] as const;

export type CatalogProactiveKind = (typeof CATALOG_KINDS)[number];

export function isCatalogKind(kind: string): kind is CatalogProactiveKind {
  return (CATALOG_KINDS as readonly string[]).includes(kind);
}

export const CATALOG_KIND_LABELS: Record<CatalogProactiveKind, string> = {
  evening_journal: "Evening journal nudge",
  drift_guard: "Drift / weak-moment guard",
  midday_encouragement: "Midday encouragement",
  stale_list_nudge: "Stale list nudge",
  chat_inactivity: "Chat inactivity check-in",
  meal_log_reminder: "Meal log reminder",
  meal_adherence_nudge: "Planned meal adherence nudge",
  meal_eod_reconciliation: "End-of-day meal catch-up",
  meal_gap_nudge: "Snack / gap log nudge",
  weekly_nutrition_review: "Weekly nutrition review",
};

export const DEFAULT_CATALOG_SCHEDULE: Record<CatalogProactiveKind, ProactiveSchedule> = {
  evening_journal: { type: "recurring_local", localHour: 21, windowMinutes: 14 },
  drift_guard: { type: "conditional" },
  midday_encouragement: { type: "recurring_local", localHour: 12, windowMinutes: 14 },
  stale_list_nudge: { type: "conditional" },
  chat_inactivity: { type: "conditional" },
  meal_log_reminder: { type: "conditional" },
  meal_adherence_nudge: { type: "conditional" },
  meal_eod_reconciliation: { type: "recurring_local", localHour: 21, windowMinutes: 20 },
  meal_gap_nudge: { type: "conditional" },
  weekly_nutrition_review: { type: "recurring_local", localHour: 18, windowMinutes: 20 },
};

export const DEFAULT_CATALOG_CAP: Record<CatalogProactiveKind, ProactiveCapBucket> = {
  evening_journal: "scheduled",
  drift_guard: "adaptive",
  midday_encouragement: "adaptive",
  stale_list_nudge: "adaptive",
  chat_inactivity: "adaptive",
  meal_log_reminder: "scheduled",
  meal_adherence_nudge: "adaptive",
  meal_eod_reconciliation: "scheduled",
  meal_gap_nudge: "adaptive",
  weekly_nutrition_review: "scheduled",
};

export const DEFAULT_CATALOG_TRIGGER: Record<CatalogProactiveKind, ProactiveTriggerType> = {
  evening_journal: "recurring",
  drift_guard: "conditional",
  midday_encouragement: "recurring",
  stale_list_nudge: "conditional",
  chat_inactivity: "conditional",
  meal_log_reminder: "conditional",
  meal_adherence_nudge: "conditional",
  meal_eod_reconciliation: "recurring",
  meal_gap_nudge: "conditional",
  weekly_nutrition_review: "recurring",
};

export const DEFAULT_CATALOG_COOLDOWN_HOURS: Partial<Record<CatalogProactiveKind, number>> = {
  drift_guard: 24,
  midday_encouragement: 24,
  stale_list_nudge: 72,
  chat_inactivity: 48,
  meal_adherence_nudge: 12,
  meal_gap_nudge: 8,
};
