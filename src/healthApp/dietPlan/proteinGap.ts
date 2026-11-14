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
  /** Magnus applied it by default (12 Nov plan, item 7); they can undo it. */
  auto?: boolean;
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
  if (g.answered?.choice === "accept" && g.answered.auto) return `${base} Magnus set ${acceptedTarget(g.plannedG)} g as their target by default until that changes (they can undo it on the Meals tab): don't flag protein below ${g.targetG} g.`;
  if (g.answered?.choice === "accept") return `${base} They accepted ${acceptedTarget(g.plannedG)} g as their target until that changes: don't flag protein below ${g.targetG} g.`;
  if (g.answered?.choice === "supplement") return `${base} They chose to add a protein supplement.`;
  return `${base} Not decided yet: this is the plan's limit, not their failure. Offer the choice on the Meals tab (accept the lower target for now, add a supplement, or loosen a rule).`;
}

// ---------- every target, not just protein (Saksham, 11 Nov) ----------

/**
 * How far a plan may sit from each target before it's flagged at build. Protein uses the 90% bar
 * above (and keeps its own three choices); the rest are flagged and can be accepted as they are.
 */
export const GAP_LIMITS = {
  kcal: { label: "Calories", unit: "kcal", under: 0.9, over: 1.1 },
  proteinG: { label: "Protein", unit: "g", under: PROTEIN_GAP_SHARE, over: null },
  carbsG: { label: "Carbs", unit: "g", under: 0.8, over: 1.2 },
  fatG: { label: "Fat", unit: "g", under: 0.8, over: 1.25 },
  fiberG: { label: "Fibre", unit: "g", under: 0.8, over: null },
} as const;
export type GapKey = keyof typeof GAP_LIMITS;

export type NutrientGap = { key: GapKey; label: string; unit: string; planned: number; target: number; direction: "under" | "over" };

/** Stored when they accept the plan as it is for the non-protein gaps (prefs.planGapsOk). */
export type StoredGapsOk = { keys: GapKey[]; rulesKey: string; at: string; auto?: boolean };

type DayTotals = { kcal: number; proteinG: number; carbsG: number; fatG: number; fiberG?: number | null };

/** Average planned totals over days with no eat-out allowance. Null when there's nothing to judge. Pure. */
export function plannedAverages(days: Array<{ planned: DayTotals; allowances: unknown[] }>): Record<GapKey, number> | null {
  const known = days.filter((d) => !d.allowances.length);
  if (!known.length) return null;
  const avg = (f: (t: DayTotals) => number) => Math.round(known.reduce((s, d) => s + f(d.planned), 0) / known.length);
  return { kcal: avg((t) => t.kcal), proteinG: avg((t) => t.proteinG), carbsG: avg((t) => t.carbsG), fatG: avg((t) => t.fatG), fiberG: avg((t) => t.fiberG ?? 0) };
}

/**
 * Every target the planned meals miss, protein first. Protein compares against the target before an
 * accepted gap lowered it; a target that's missing or 0 (older plans have no fibre) is skipped. Pure.
 */
export function planGapsOf(planned: Record<GapKey, number> | null, targets: Partial<Record<GapKey, number | null>>, protein: ProteinGap | null): NutrientGap[] {
  if (!planned) return [];
  const out: NutrientGap[] = [];
  for (const key of Object.keys(GAP_LIMITS) as GapKey[]) {
    const lim = GAP_LIMITS[key];
    const target = key === "proteinG" && protein ? protein.targetG : targets[key];
    if (!target || target <= 0) continue;
    const p = key === "proteinG" && protein ? protein.plannedG : planned[key];
    const direction = p < target * lim.under ? "under" : lim.over != null && p > target * lim.over ? "over" : null;
    if (key === "proteinG" && !protein) continue;
    if (direction) out.push({ key, label: lim.label, unit: lim.unit, planned: p, target: Math.round(target), direction });
  }
  return out;
}

/** The gaps still to show: protein follows its own answer; the rest hide once accepted for these rules. Pure. */
export function openGaps(gaps: NutrientGap[], ok: StoredGapsOk | null | undefined, key: string): NutrientGap[] {
  const accepted = ok && ok.rulesKey === key ? new Set(ok.keys) : new Set<GapKey>();
  return gaps.filter((g) => g.key === "proteinG" || !accepted.has(g.key));
}

const fmtN = (g: NutrientGap) => `${g.label.toLowerCase()} about ${g.planned.toLocaleString("en-US")} of ${g.target.toLocaleString("en-US")} ${g.unit}`;

/** For the coach and every plan build: all the plan's gaps in one line, protein's decision included. Pure. */
export function gapsLine(gaps: NutrientGap[], protein: ProteinGap | null, cause: string): string | null {
  const others = gaps.filter((g) => g.key !== "proteinG");
  const parts: string[] = [];
  if (protein) parts.push(gapLine(protein));
  if (others.length) {
    parts.push(
      `Meal plan vs other targets: the planned meals reach ${others.map(fmtN).join(", ")}, limited by ${cause}. This is the plan's limit, not their failure: don't flag these against them; the Meals tab shows it and lets them accept it or change a rule.`,
    );
  }
  return parts.length ? parts.join(" ") : null;
}

/**
 * What Magnus answers by default when the plan opens with gaps nobody has decided on (12 Nov plan,
 * item 7): the protein target follows the plan for now, and the other gaps are kept as planned.
 * Nothing when they undid the defaults for these rules. Pure.
 */
export function gapDefaults(input: { protein: ProteinGap | null; others: NutrientGap[]; key: string; undone: string | null | undefined }): { acceptProtein: boolean; keepKeys: GapKey[] } | null {
  if (input.undone === input.key) return null;
  const acceptProtein = !!input.protein && !input.protein.answered;
  const keepKeys = input.others.filter((g) => g.key !== "proteinG").map((g) => g.key);
  return acceptProtein || keepKeys.length ? { acceptProtein, keepKeys } : null;
}
