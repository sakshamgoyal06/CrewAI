/**
 * When the meal plan can't reach the protein target because of the person's own food rules (a veg
 * period, the avoid list, fasting days), the plan says so and asks once what to do, and the answer
 * is kept until the rules change (Saksham, 11 Nov: the plan reached ~109 g of 165 g and the coach
 * flagged protein every night for a gap its own plan made).
 *
 * - accept: the protein target follows the plan until the rules change, then goes back.
 * - supplement: a protein supplement serving is added to their supplements; the plan rebuilds.
 * - loosen: they change a rule in plan setup (nothing is stored; the plan asks again if it's still short).
 */
import type { DietPrefs } from "./prefs.js";
import type { PlanRules } from "./rules.js";

/** The plan must reach at least this share of the protein target (Saksham: within 10%). */
export const PROTEIN_GAP_SHARE = 0.9;

export const GAP_CHOICES = ["accept", "supplement", "loosen"] as const;
export type GapChoice = (typeof GAP_CHOICES)[number];

/** Stored in the plan setup (prefs.proteinGap) once they answer. */
export type StoredGap = {
  choice: "accept" | "supplement";
  plannedG: number;
  /** The target before an accepted gap lowered it; restored when the rules change. */
  originalTargetG: number;
  /** The rules the answer was given under (rulesKey). */
  rulesKey: string;
  at: string;
};

export type ProteinGap = {
  plannedG: number;
  targetG: number;
  /** What in their rules limits protein, in words ("your veg period until 25 Nov"). */
  cause: string;
  /** Their answer, when it still holds for these rules. */
  answered: StoredGap | null;
};

type DayPlanned = { planned: { proteinG: number }; allowances: unknown[] };

/**
 * Average planned protein over the planned days with no eat-out allowance (an eat-out meal's
 * protein isn't known until it's logged). Null when there's nothing to judge. Pure.
 */
export function plannedProtein(days: DayPlanned[]): number | null {
  const known = days.filter((d) => !d.allowances.length);
  if (!known.length) return null;
  return Math.round(known.reduce((s, d) => s + d.planned.proteinG, 0) / known.length);
}

/** The rules that decide what can be planned; a change means the answer must be asked again. Pure. */
export function rulesKey(rules: Pick<PlanRules, "diet" | "avoid">, prefs: Pick<DietPrefs, "dietOverride" | "fastingDays" | "supplements">): string {
  const o = prefs.dietOverride;
  return JSON.stringify([
    rules.diet ?? null,
    [...rules.avoid].map((a) => a.toLowerCase()).sort(),
    o ? [o.diet ?? null, o.until] : null,
    [...prefs.fastingDays].sort(),
    prefs.supplements.map((s) => `${s.name.toLowerCase()}×${s.servings}`).sort(),
  ]);
}

/** What in their rules is most likely to hold protein down, in words. Pure. */
export function gapCause(rules: Pick<PlanRules, "diet" | "avoid">, prefs: Pick<DietPrefs, "dietOverride" | "fastingDays">): string {
  const o = prefs.dietOverride;
  const until = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  if (o?.diet) return `your ${o.diet === "vegetarian" ? "veg" : o.diet} period until ${until(o.until)}`;
  if (o?.avoid?.length) return `the foods you're avoiding until ${until(o.until)}`;
  if (rules.diet === "vegan") return "a vegan diet";
  if (rules.diet === "jain") return "a Jain diet";
  if (rules.diet === "vegetarian") return "a vegetarian diet";
  if (prefs.fastingDays.length) return "your fasting days";
  if (rules.avoid.length) return "your avoid list";
  return "your food settings";
}

/**
 * The gap to show, or null when the plan reaches the target (within 10%). A stored answer counts
 * only for the same rules; an accepted gap compares against the target they had before. Pure.
 */
export function proteinGapOf(input: { plannedG: number | null; targetG: number; stored: StoredGap | null; key: string; cause: string }): ProteinGap | null {
  if (input.plannedG == null || input.targetG <= 0) return null;
  const answered = input.stored && input.stored.rulesKey === input.key ? input.stored : null;
  const target = answered?.choice === "accept" ? answered.originalTargetG : input.targetG;
  if (input.plannedG >= target * PROTEIN_GAP_SHARE) return null;
  return { plannedG: input.plannedG, targetG: target, cause: input.cause, answered };
}

/** The protein target an accepted gap sets: the plan's protein, to the nearest 5 g. Pure. */
export function acceptedTarget(plannedG: number): number {
  return Math.max(40, Math.round(plannedG / 5) * 5);
}

/** For the coach: what the plan can reach and what was decided, in one line. Pure. */
export function gapLine(g: ProteinGap): string {
  const base = `Meal plan protein: the planned meals reach about ${g.plannedG} g of ${g.targetG} g, limited by ${g.cause}.`;
  if (g.answered?.choice === "accept") return `${base} They accepted ${acceptedTarget(g.plannedG)} g as their target until that changes: don't flag protein below ${g.targetG} g.`;
  if (g.answered?.choice === "supplement") return `${base} They chose to add a protein supplement.`;
  return `${base} Not decided yet: this is the plan's limit, not their failure. Offer the choice on the Meals tab (accept the lower target for now, add a supplement, or loosen a rule).`;
}
