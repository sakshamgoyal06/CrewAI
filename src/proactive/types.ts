/**
 * Magnus-initiated Telegram messages (not direct replies to a user turn).
 */

/** What kind of proactive message this is (for logs and future routing). */
export type ProactiveMessageKind =
  | "morning_brief"
  | "event_reminder"
  | "custom";

/** How the message was triggered. */
export type ProactiveTrigger =
  | "scheduled"
  | "manual"
  | "event_reminder";

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
