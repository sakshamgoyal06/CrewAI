/**
 * Parse which meal slots to include in a plan.
 */
import type { MealSlot } from "../types.js";

export type PlannedSlot = Exclude<MealSlot, "unspecified">;

const ALL_SLOTS: PlannedSlot[] = ["breakfast", "lunch", "dinner", "snack"];
const DEFAULT_SLOTS: PlannedSlot[] = ["breakfast", "lunch", "dinner"];

function uniqueSlots(slots: PlannedSlot[]): PlannedSlot[] {
  const seen = new Set<PlannedSlot>();
  const out: PlannedSlot[] = [];
  for (const s of slots) {
    if (!seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  }
  return out;
}

/** Parse slot preferences from free text; null → caller should ask or use defaults. */
export function parsePlanningSlots(rawMessage: string): PlannedSlot[] | null {
  const lower = rawMessage.trim().toLowerCase();
  if (!lower) {
    return null;
  }

  if (/\b(?:default|standard|usual|all\s+three|3\s+meals|three\s+meals)\b/.test(lower)) {
    return [...DEFAULT_SLOTS];
  }

  if (/\b(?:dinners?\s+only|just\s+dinners?)\b/.test(lower)) {
    return ["dinner"];
  }

  if (/\b(?:lunch(?:es)?\s+and\s+dinners?|lunch\s*\+\s*dinner)\b/.test(lower)) {
    return ["lunch", "dinner"];
  }

  const found: PlannedSlot[] = [];
  if (/\bbreakfasts?\b/.test(lower)) {
    found.push("breakfast");
  }
  if (/\blunches?\b/.test(lower)) {
    found.push("lunch");
  }
  if (/\bdinners?\b/.test(lower)) {
    found.push("dinner");
  }
  if (/\bsnacks?\b/.test(lower)) {
    found.push("snack");
  }

  if (found.length) {
    return uniqueSlots(found);
  }

  if (/\b(?:add\s+snacks?|include\s+snacks?|with\s+snacks?)\b/.test(lower)) {
    return [...DEFAULT_SLOTS, "snack"];
  }

  if (/\b(?:no\s+snacks?|skip\s+snacks?|without\s+snacks?)\b/.test(lower)) {
    return [...DEFAULT_SLOTS];
  }

  return null;
}

export function defaultSlotsFromTimingNotes(notes: string | null | undefined): PlannedSlot[] {
  if (notes && /\bsnack\b/i.test(notes)) {
    return [...DEFAULT_SLOTS, "snack"];
  }
  return [...DEFAULT_SLOTS];
}

export function formatSlotsLabel(slots: PlannedSlot[]): string {
  return slots.map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(", ");
}

export function allPlanningSlots(): PlannedSlot[] {
  return [...ALL_SLOTS];
}
