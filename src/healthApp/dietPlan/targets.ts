/**
 * The day's numbers for the diet plan. The plan never sets its own calories: it splits the
 * profile's calorie and protein targets (onboarding, adaptive review, interventions) into fat,
 * carbs and fibre, then into one budget per meal. Pure.
 *
 * Rules (plan doc, decided 2026-11-04):
 * - Protein stays as the profile has it.
 * - Fat is 28% of calories, never under 0.6 g per kg of body weight.
 * - Carbs are what is left. Fibre is 14 g per 1,000 kcal.
 * - Meals share the calories: breakfast 25%, lunch 35%, snack 10%, dinner 30% by default.
 */

export const PLAN_SLOTS = ["breakfast", "lunch", "snack", "dinner"] as const;
export type PlanSlot = (typeof PLAN_SLOTS)[number];

export const DEFAULT_SHARES: Record<PlanSlot, number> = { breakfast: 25, lunch: 35, snack: 10, dinner: 30 };

export const FAT_SHARE = 0.28;
export const MIN_FAT_G_PER_KG = 0.6;
export const FIBER_G_PER_1000_KCAL = 14;

export type MacroTargets = { calories: number; proteinG: number; fatG: number; carbsG: number; fiberG: number };

export function macroTargets(input: { calories: number; proteinG: number; weightKg: number | null }): MacroTargets {
  const calories = Math.round(input.calories);
  const proteinG = Math.round(input.proteinG);
  const byShare = (calories * FAT_SHARE) / 9;
  const floor = input.weightKg ? input.weightKg * MIN_FAT_G_PER_KG : 0;
  const fatG = Math.round(Math.max(byShare, floor));
  const carbsG = Math.max(0, Math.round((calories - proteinG * 4 - fatG * 9) / 4));
  const fiberG = Math.round((calories / 1000) * FIBER_G_PER_1000_KCAL);
  return { calories, proteinG, fatG, carbsG, fiberG };
}

export type MealBudget = {
  slot: PlanSlot;
  /** Percent of the day, after the shares of the meals they eat are scaled to 100. */
  share: number;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
};

/** One budget per meal they eat, in day order. Shares of the meals present are scaled to sum to 100. */
export function mealBudgets(t: MacroTargets, shares: Partial<Record<PlanSlot, number>>): MealBudget[] {
  const present = PLAN_SLOTS.filter((s) => (shares[s] ?? 0) > 0);
  const total = present.reduce((a, s) => a + (shares[s] ?? 0), 0);
  if (!total) return [];
  return present.map((slot) => {
    const f = (shares[slot] ?? 0) / total;
    return {
      slot,
      share: Math.round(f * 100),
      calories: Math.round(t.calories * f),
      proteinG: Math.round(t.proteinG * f),
      carbsG: Math.round(t.carbsG * f),
      fatG: Math.round(t.fatG * f),
    };
  });
}

/** On-track band for a day's calories (decision 4): 85–105% of target. */
export const DAY_BAND = { low: 0.85, high: 1.05 } as const;
