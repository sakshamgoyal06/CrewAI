/**
 * Default local hours for meal-slot reminders and adherence grace windows.
 */
import type { MealSlot } from "./types.js";

export type PlannedMealSlot = Exclude<MealSlot, "unspecified">;

export const DEFAULT_MEAL_SLOT_HOURS: Record<PlannedMealSlot, number> = {
  breakfast: 9,
  lunch: 13,
  dinner: 19,
  snack: 16,
};

export function slotHour(
  slot: PlannedMealSlot,
  overrides?: Partial<Record<PlannedMealSlot, number>>,
): number {
  const h = overrides?.[slot];
  if (typeof h === "number" && h >= 0 && h <= 23) {
    return h;
  }
  return DEFAULT_MEAL_SLOT_HOURS[slot];
}

export function slotLabel(slot: PlannedMealSlot): string {
  return slot.charAt(0).toUpperCase() + slot.slice(1);
}

/** Rough parse: "breakfast 8am" → 8 */
export function parseMealTimingOverrides(notes: string | null | undefined): Partial<Record<PlannedMealSlot, number>> {
  if (!notes?.trim()) {
    return {};
  }
  const out: Partial<Record<PlannedMealSlot, number>> = {};
  const lower = notes.toLowerCase();
  for (const slot of ["breakfast", "lunch", "dinner", "snack"] as const) {
    const re = new RegExp(`\\b${slot}\\b[^\\n]{0,24}?(\\d{1,2})(?::\\d{2})?\\s*(?:am|pm)?`, "i");
    const m = lower.match(re);
    if (!m?.[1]) {
      continue;
    }
    let hour = Number.parseInt(m[1], 10);
    if (Number.isNaN(hour)) {
      continue;
    }
    const segment = m[0] ?? "";
    if (/pm/i.test(segment) && hour < 12) {
      hour += 12;
    }
    if (/am/i.test(segment) && hour === 12) {
      hour = 0;
    }
    if (hour >= 0 && hour <= 23) {
      out[slot] = hour;
    }
  }
  return out;
}
