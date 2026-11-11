/**
 * BMR and total burn for the tracker.
 *
 *   BMR        = Mifflin-St Jeor (10·kg + 6.25·cm − 5·age + 5 for men, −161 for women), the
 *                same formula onboarding and the calorie floor use, at the latest weigh-in.
 *   total burn = the phone's "Total calories burned" when Health Connect has it, else
 *                BMR + the day's active burn (steps, gym, logged activities; see activities.ts).
 *
 * Today's estimate counts BMR only for the part of the day that has passed, so it reads "so far"
 * like the phone's number does. Display only: the calorie target never follows burn (the adaptive
 * target already reflects their usual activity). Pure.
 */

export type BodyBasics = { sex: string | null; birthYear: number | null; heightCm: number | null };

/** Resting burn for a whole day, rounded; null when sex, birth year, height or weight is missing. */
export function bmrOf(b: BodyBasics, weightKg: number | null, today: string): number | null {
  if (!b.sex || !b.birthYear || !b.heightCm || !weightKg) return null;
  const age = Number(today.slice(0, 4)) - b.birthYear;
  return Math.round(10 * weightKg + 6.25 * b.heightCm - 5 * age + (b.sex === "male" ? 5 : -161));
}

export type TotalBurn = {
  kcal: number;
  /** Resting part counted in kcal (all of BMR for a past day, the share so far for today). */
  restingKcal: number | null;
  activeKcal: number;
  source: "phone" | "estimate";
  /** Today, still counting. */
  soFar: boolean;
};

/**
 * One day's total burn. dayShare is the fraction of today that has passed (ignored for past
 * days). Null when there's neither a phone total nor a BMR to estimate from.
 */
export function totalBurnForDay(input: {
  bmr: number | null;
  activeKcal: number | null;
  phoneTotalKcal: number | null;
  isToday: boolean;
  dayShare: number;
}): TotalBurn | null {
  const active = Math.max(0, Math.round(input.activeKcal ?? 0));
  if (input.phoneTotalKcal != null && input.phoneTotalKcal > 0) {
    return { kcal: Math.round(input.phoneTotalKcal), restingKcal: null, activeKcal: active, source: "phone", soFar: input.isToday };
  }
  if (input.bmr == null) return null;
  const share = input.isToday ? Math.min(1, Math.max(0, input.dayShare)) : 1;
  const resting = Math.round(input.bmr * share);
  return { kcal: resting + active, restingKcal: resting, activeKcal: active, source: "estimate", soFar: input.isToday };
}
