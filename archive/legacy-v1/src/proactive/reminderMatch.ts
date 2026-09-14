/**
 * Matching reminders the way users refer to them.
 *
 * Standalone reminders have no label of their own — the display title is the message body, emoji
 * and all. "Cancel reminders for coriander water change" therefore has to match
 * "💧 Change the water in your coriander plant!". Requiring every query token to appear verbatim
 * failed on the filler words, and identical duplicate rows produced an ambiguity error the user
 * could not resolve, so the reminder kept firing.
 */

const FILLER_TOKENS = new Set([
  "a",
  "about",
  "all",
  "an",
  "and",
  "any",
  "at",
  "cancel",
  "change",
  "daily",
  "delete",
  "drop",
  "every",
  "for",
  "from",
  "in",
  "is",
  "it",
  "me",
  "my",
  "of",
  "off",
  "on",
  "please",
  "reminder",
  "reminders",
  "remove",
  "set",
  "stop",
  "that",
  "the",
  "this",
  "to",
  "turn",
  "up",
  "was",
  "with",
]);

/** Lowercase, strip emoji/punctuation, collapse whitespace. */
export function normalizeReminderText(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[\p{Extended_Pictographic}\p{Emoji_Presentation}]/gu, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stem(token: string): string {
  if (token.length > 4 && token.endsWith("ing")) {
    return token.slice(0, -3);
  }
  if (token.length > 3 && token.endsWith("es")) {
    return token.slice(0, -2);
  }
  if (token.length > 3 && token.endsWith("s")) {
    return token.slice(0, -1);
  }
  return token;
}

/** Content tokens with filler and short words removed. */
export function reminderTokens(raw: string): string[] {
  return normalizeReminderText(raw)
    .split(" ")
    .filter((t) => t.length > 1 && !FILLER_TOKENS.has(t))
    .map(stem);
}

/**
 * How well a query describes a reminder title: the share of the query's content tokens present in
 * the title. `1` means the query named nothing the title lacks.
 */
export function reminderQueryScore(query: string, title: string): number {
  const queryTokens = reminderTokens(query);
  if (queryTokens.length === 0) {
    return 0;
  }
  const titleTokens = new Set(reminderTokens(title));
  if (titleTokens.size === 0) {
    return 0;
  }
  let hits = 0;
  for (const token of new Set(queryTokens)) {
    if (titleTokens.has(token)) {
      hits += 1;
      continue;
    }
    for (const candidate of titleTokens) {
      if (candidate.startsWith(token) || token.startsWith(candidate)) {
        hits += 1;
        break;
      }
    }
  }
  return hits / new Set(queryTokens).size;
}

/** Symmetric overlap between two reminder bodies — used to spot a duplicate before inserting one. */
export function reminderSimilarity(a: string, b: string): number {
  const left = normalizeReminderText(a);
  const right = normalizeReminderText(b);
  if (!left || !right) {
    return 0;
  }
  if (left === right) {
    return 1;
  }
  const leftTokens = new Set(reminderTokens(a));
  const rightTokens = new Set(reminderTokens(b));
  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0;
  }
  let shared = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      shared += 1;
    }
  }
  return shared / new Set([...leftTokens, ...rightTokens]).size;
}

/** Two reminder bodies the user would consider the same reminder. */
export const DUPLICATE_REMINDER_THRESHOLD = 0.6;

export function isSameReminder(a: string, b: string): boolean {
  return reminderSimilarity(a, b) >= DUPLICATE_REMINDER_THRESHOLD;
}

/** Query score at or above this counts as naming the reminder. */
export const REMINDER_QUERY_THRESHOLD = 0.6;

/**
 * Stable short key for a reminder body, used to collapse duplicate deliveries within a day.
 * Two rows the user considers the same reminder produce the same key.
 */
export function reminderContentKey(message: string): string {
  const normalized = normalizeReminderText(message);
  let hash = 5381;
  for (let i = 0; i < normalized.length; i += 1) {
    hash = ((hash << 5) + hash + normalized.charCodeAt(i)) & 0xffffffff;
  }
  return (hash >>> 0).toString(36);
}
