/**
 * Apply meal-slot timing corrections without re-logging food or full-day recount.
 */
import type { MealSlot } from "./parseMealLogCommand.js";
import type { MealSessionSummary } from "../nutrition/store/mealHistoryStore.js";
import { isMealSlotCorrectionMessage } from "./mealLogIntent.js";

export type MealSlotCorrectionResult =
  | { ok: true; mealSessionId: string; fromSlot: MealSlot; toSlot: MealSlot; label: string }
  | { ok: false; reason: "not_correction" | "no_sessions" | "no_match" };

const SLOT_ALIASES: Array<{ pattern: RegExp; slot: MealSlot }> = [
  { pattern: /\b(?:in\s+the\s+)?evening\b|\bevening\b/i, slot: "snack" },
  { pattern: /\bmid[\s-]?morning\b/i, slot: "snack" },
  { pattern: /\bbreakfast\b/i, slot: "breakfast" },
  { pattern: /\blunch\b/i, slot: "lunch" },
  { pattern: /\bdinner\b/i, slot: "dinner" },
  { pattern: /\bsnack\b/i, slot: "snack" },
];

function inferTargetSlot(message: string): MealSlot | null {
  for (const { pattern, slot } of SLOT_ALIASES) {
    if (pattern.test(message)) {
      return slot;
    }
  }
  return null;
}

function sessionMentionedInMessage(session: MealSessionSummary, message: string): boolean {
  const lower = message.toLowerCase();
  const tokens = session.rawText
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 3);
  return tokens.some((t) => lower.includes(t));
}

/**
 * Match a slot-correction message to today's sessions and a new slot.
 */
export function resolveMealSlotCorrection(
  message: string,
  sessions: MealSessionSummary[],
): MealSlotCorrectionResult {
  if (!isMealSlotCorrectionMessage(message)) {
    return { ok: false, reason: "not_correction" };
  }
  if (!sessions.length) {
    return { ok: false, reason: "no_sessions" };
  }

  const toSlot = inferTargetSlot(message);
  if (!toSlot) {
    return { ok: false, reason: "no_match" };
  }

  const matched =
    sessions.find((s) => sessionMentionedInMessage(s, message)) ??
    sessions.find((s) => /\bsamosa\b/i.test(message) && /\bsamosa\b/i.test(s.rawText)) ??
    sessions[0];

  if (!matched) {
    return { ok: false, reason: "no_match" };
  }

  if (matched.mealSlot === toSlot) {
    return { ok: false, reason: "no_match" };
  }

  return {
    ok: true,
    mealSessionId: matched.mealSessionId,
    fromSlot: matched.mealSlot,
    toSlot,
    label: matched.rawText.slice(0, 80),
  };
}
