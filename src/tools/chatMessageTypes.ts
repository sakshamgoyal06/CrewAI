/**
 * `magnus_chat_messages.message_type` and `delivery_trigger` — how a row was produced.
 */

/** Normal user ↔ Magnus chat turn vs Magnus-initiated outbound. */
export const CHAT_MESSAGE_TYPES = ["conversation", "automated"] as const;
export type ChatMessageType = (typeof CHAT_MESSAGE_TYPES)[number];

/**
 * Why an automated message was sent, or what the user was requesting (manual triggers).
 * Null on plain conversation rows.
 */
export const CHAT_DELIVERY_TRIGGERS = [
  "manual",
  "scheduled",
  "http",
  "event_reminder",
  "system",
  "inactivity",
  "activity",
] as const;
export type ChatDeliveryTrigger = (typeof CHAT_DELIVERY_TRIGGERS)[number];

export function isChatMessageType(value: string): value is ChatMessageType {
  return (CHAT_MESSAGE_TYPES as readonly string[]).includes(value);
}

export function isChatDeliveryTrigger(value: string): value is ChatDeliveryTrigger {
  return (CHAT_DELIVERY_TRIGGERS as readonly string[]).includes(value);
}

/** User or assistant row from a normal Telegram turn. */
export function conversationChatFields(): {
  message_type: ChatMessageType;
  delivery_trigger: null;
} {
  return { message_type: "conversation", delivery_trigger: null };
}

/** Magnus-initiated outbound (brief, reminder, OAuth confirm, …). */
export function automatedChatFields(trigger: ChatDeliveryTrigger): {
  message_type: ChatMessageType;
  delivery_trigger: ChatDeliveryTrigger;
} {
  return { message_type: "automated", delivery_trigger: trigger };
}

/** User message that requests an automated ritual (e.g. “morning brief”). */
export function manualTriggerRequestFields(): {
  message_type: ChatMessageType;
  delivery_trigger: ChatDeliveryTrigger;
} {
  return { message_type: "conversation", delivery_trigger: "manual" };
}
