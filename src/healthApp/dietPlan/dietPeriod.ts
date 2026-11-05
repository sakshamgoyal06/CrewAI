/**
 * A temporary diet ("veg only for the next 20 days"): the plan follows it until its last date,
 * then goes back to the diet in their food settings. Pure helpers; store.ts applies it.
 */
import type { PersonDiet } from "./compose.js";

export const PERIOD_DIETS = ["vegetarian", "eggetarian", "vegan", "jain"] as const;
export type PeriodDiet = (typeof PERIOD_DIETS)[number];
export type DietOverride = { diet?: PeriodDiet | null; avoid?: string[]; from: string; until: string };

/** Higher = fewer foods allowed. */
const STRICT: Record<string, number> = { non_vegetarian: 0, custom: 0, eggetarian: 1, vegetarian: 2, vegan: 3, jain: 3 };

/** The override while today is inside it, else null. */
export function activeOverride(o: DietOverride | null | undefined, today: string): DietOverride | null {
  return o && o.until >= today ? o : null;
}

/** The diet the plan follows today: a temporary diet only ever narrows their own, never widens it. */
export function effectiveDiet(base: PersonDiet, o: DietOverride | null | undefined, today: string): PersonDiet {
  const a = activeOverride(o, today);
  if (!a?.diet) return base;
  return (STRICT[a.diet] ?? 0) > (STRICT[base ?? "non_vegetarian"] ?? 0) ? a.diet : base;
}
