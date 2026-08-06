/**
 * Magnus-initiated Telegram messages (not direct replies to a user turn).
 */

/** What kind of proactive message this is (for logs and future routing). */
export type ProactiveMessageKind =
  | "morning_brief"
  | "event_reminder"
  | "evening_journal"
  | "drift_guard"
  | "custom_reminder"
  | "midday_encouragement"
  | "stale_list_nudge"
  | "chat_inactivity"
  | "custom";

/** How the message was triggered (maps to `magnus_chat_messages.delivery_trigger`). */
export type ProactiveTrigger =
  | "scheduled"
  | "manual"
  | "http"
  | "event_reminder"
  | "system";

/** Reserved for later: inactivity nudges, activity follow-ups, etc. */
export type ProactiveTriggerFuture = "inactivity" | "activity";

export type ProactiveSendInput = {
  chatId: string;
  telegramUserIdForLog: string;
  userProfileId: string;
  plainText: string;
  kind: ProactiveMessageKind;
  trigger: ProactiveTrigger;
  /** Stored on `magnus_chat_messages.intent` when set. */
  intent?: string | null;
};
