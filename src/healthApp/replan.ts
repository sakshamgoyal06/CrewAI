/**
 * Re-plan when the goal changes. Moving the goal date (or the target) changes the pace the goal
 * needs, so the daily calorie target is recomputed for it, the meal plan is rebuilt on the new
 * target, and the person gets back what changed plus a warning when the pace is unsafe.
 *
 * The target comes from the adaptive review when there is enough data (real maintenance), else the
 * day-1 formula from the interview answers. Both apply the same safety caps.
 */
import { localDateKey } from "../nutrition/localDate.js";
import { supabase } from "../tools/clients.js";
import { logger } from "../logger.js";
import { loggableError } from "../util/loggableError.js";
import { dayNumber } from "../util/time.js";
import type { ActionContext } from "./actions.js";
import { getActiveGoal, getBodyCheckins } from "./bodyStore.js";
import { loadCalorieReview } from "./calorieTarget.js";
import { rebuildPlan } from "./dietPlan/store.js";
import type { HealthGoal } from "./goalProgress.js";
import { humanDate, startingPlan, type OnboardingInput } from "./onboarding.js";
import { loadHealthProfile } from "./snapshot.js";

/** Smaller calorie and protein moves than these are left alone. */
const MIN_APPLY_KCAL = 50;
const MIN_APPLY_PROTEIN_G = 5;

type GoalType = OnboardingInput["goalType"];
const GOAL_TYPE_LABEL: Record<GoalType, string> = { lose: "Lose fat", gain: "Gain", recomp: "Recomp" };

/** Gain when the goal weight is over half a kilo above today's, lose when below, recomp in between. Pure. */
export function goalTypeFor(prev: GoalType, currentKg: number, targetKg: number | null): GoalType {
  if (targetKg === null) return prev;
  if (targetKg > currentKg + 0.5) return "gain";
  if (targetKg < currentKg - 0.5) return "lose";
  return "recomp";
}

export type ReplanChange = { label: string; from: string | null; to: string | null };

export type ReplanResult = {
  /** The goal date or targets actually moved. */
  changed: boolean;
  calorieTarget: { from: number | null; to: number };
  /** kg a week the new target aims for (negative = losing). */
  plannedKgPerWeek: number | null;
  /** kg a week the date needs before the safety cap. */
  neededKgPerWeek: number | null;
  cappedForSafety: boolean;
  /** When capped: the date the safe pace reaches the target. */
  safeDate: string | null;
  source: "your_data" | "formula";
  mealPlanRebuilt: boolean;
  changes: ReplanChange[];
  /** Plain-language notes, the unsafe-pace warning first. */
  lines: string[];
};

const kcal = (n: number): string => `${Math.round(n).toLocaleString("en-US")} kcal`;
const kgw = (n: number): string => `${Math.abs(n).toFixed(2)} kg a week`;

/** What differs between two goals, as lines for the screen. Pure. */
export function goalChanges(before: HealthGoal | null, after: HealthGoal): ReplanChange[] {
  const out: ReplanChange[] = [];
  if (before?.deadline !== after.deadline) {
    out.push({ label: "Goal date", from: before ? humanDate(before.deadline) : null, to: humanDate(after.deadline) });
  }
  const t: Array<[keyof HealthGoal["targets"], string, string]> = [
    ["weight_kg", "Target weight", "kg"],
    ["body_fat_pct", "Target body fat", "%"],
    ["muscle_mass_kg", "Target muscle", "kg"],
  ];
  for (const [k, label, unit] of t) {
    const a = before?.targets[k] ?? null;
    const b = after.targets[k] ?? null;
    if (a !== b) out.push({ label, from: a === null ? null : `${a} ${unit}`, to: b === null ? null : `${b} ${unit}` });
  }
  return out;
}

/** Sentences for the result: the new target and pace, then any warning. Pure. */
export function replanLines(x: {
  deadline: string;
  targetWeightKg: number | null;
  weeksLeft: number;
  from: number | null;
  to: number;
  plannedKgPerWeek: number | null;
  neededKgPerWeek: number | null;
  capped: boolean;
  safeDate: string | null;
}): string[] {
  const lines: string[] = [];
  if (x.capped) {
    const needs = x.neededKgPerWeek !== null ? ` needs ${kgw(x.neededKgPerWeek)}, which is faster than is safe` : " needs a faster pace than is safe";
    lines.push(
      `${x.targetWeightKg !== null ? `${x.targetWeightKg} kg` : "Your goal"} by ${humanDate(x.deadline)}${needs}. Your target is held at the safe limit${x.safeDate ? `, which reaches it around ${humanDate(x.safeDate)}` : ""}. Pick a later date, or keep this one and expect to land short.`,
    );
  } else if (x.targetWeightKg !== null) {
    lines.push(`That reaches ${x.targetWeightKg} kg by ${humanDate(x.deadline)}, about ${Math.round(x.weeksLeft)} weeks away${x.plannedKgPerWeek !== null ? ` at ${kgw(x.plannedKgPerWeek)}` : ""}.`);
  }
  if (x.from === null || Math.abs(x.to - x.from) >= MIN_APPLY_KCAL) {
    lines.push(`Daily calories ${x.from === null ? "set to" : `${x.to > x.from ? "up" : "down"} from ${kcal(x.from)} to`} ${kcal(x.to)}.`);
  } else {
    lines.push(`Your ${kcal(x.to)} daily target still fits.`);
  }
  return lines;
}

async function formulaInput(ctx: ActionContext): Promise<OnboardingInput | null> {
  const { data } = await supabase
    .from("user_health_profile")
    .select("sex, birth_year, height_cm, activity_level, goal_type, diet, diet_note, food_avoid")
    .eq("user_profile_id", ctx.userProfileId)
    .maybeSingle();
  const h = data as Record<string, unknown> | null;
  if (!h?.sex || !h.birth_year || !h.height_cm) return null;
  const checkins = await getBodyCheckins(ctx.userProfileId, "1970-01-01");
  const weights = checkins.filter((c) => c.weight_kg !== null);
  const last = weights.at(-1);
  if (!last) return null;
  const profile = await loadHealthProfile(ctx.userProfileId);
  const goal = await getActiveGoal(ctx.userProfileId);
  if (!goal) return null;
  return {
    sex: h.sex as "male" | "female",
    birthYear: Number(h.birth_year),
    heightCm: Number(h.height_cm),
    weightKg: Number(last.weight_kg),
    bodyFatPct: last.body_fat_pct ?? undefined,
    goalType: (h.goal_type as "lose" | "recomp" | "gain") ?? "lose",
    targetWeightKg: goal.targets.weight_kg,
    targetBodyFatPct: goal.targets.body_fat_pct,
    deadline: goal.deadline,
    activity: (h.activity_level as "desk" | "light" | "active") ?? "light",
    trainingDays: profile.targets.trainingDays,
    gymTime: profile.gym.time,
    diet: (h.diet as OnboardingInput["diet"]) ?? "vegetarian",
    foodAvoid: [],
  };
}

/**
 * Recomputes the calorie target for the goal now in force, applies it, and rebuilds the meal plan.
 * `before` is the goal as it was ahead of the change. Never throws: a failure just means no re-plan.
 */
export async function replanForGoal(
  ctx: ActionContext,
  before: HealthGoal | null,
  setTargets: (t: { calorieTarget?: number; proteinTarget?: number }) => Promise<boolean>,
  now = new Date(),
): Promise<ReplanResult | null> {
  try {
    const goal = await getActiveGoal(ctx.userProfileId);
    if (!goal) return null;
    const changes = goalChanges(before, goal);
    const today = localDateKey(now, ctx.timezone);
    const weeksLeft = Math.max(0, (dayNumber(goal.deadline) - dayNumber(today)) / 7);
    const profile = await loadHealthProfile(ctx.userProfileId);
    const from = profile.targets.calorieTarget;

    // A weight target above today's weight is a gain goal, below it a loss: the formula, the protein
    // basis and the coach all read the goal type, so it moves with the goal. A body-fat-only goal
    // keeps the type they chose.
    const pre = await formulaInput(ctx);
    if (pre) {
      const type = goalTypeFor(pre.goalType, pre.weightKg, pre.targetWeightKg ?? null);
      if (type !== pre.goalType) {
        const { error } = await supabase.from("user_health_profile").update({ goal_type: type }).eq("user_profile_id", ctx.userProfileId);
        if (!error) changes.push({ label: "Goal type", from: GOAL_TYPE_LABEL[pre.goalType], to: GOAL_TYPE_LABEL[type] });
      }
    }

    let to: number | null = null;
    let planned: number | null = null;
    let needed: number | null = null;
    let capped = false;
    let safeDate: string | null = null;
    let source: ReplanResult["source"] = "your_data";

    const review = await loadCalorieReview(ctx.userProfileId, now);
    if (review.status === "ok" && review.targetWeightKg !== null) {
      to = review.suggestedTarget;
      planned = review.plannedKgPerWeek;
      needed = review.neededKgPerWeek;
      capped = review.cappedForSafety;
      safeDate = review.safeDate;
    } else {
      const input = await formulaInput(ctx);
      if (!input) return null;
      const plan = startingPlan(input, today);
      to = plan.calorieTarget;
      planned = plan.plannedKgPerWeek;
      needed = plan.neededKgPerWeek;
      capped = plan.cappedForSafety;
      safeDate = plan.safeDate;
      source = "formula";
    }

    // Protein follows the goal too (gain: per kg now; loss: per kg of the leaner of now and target).
    const input = await formulaInput(ctx);
    const proteinFrom = profile.targets.proteinTarget;
    const proteinTo = input ? startingPlan(input, today).proteinTarget : null;
    const moveKcal = from === null || Math.abs(to - from) >= MIN_APPLY_KCAL;
    const moveProtein = proteinTo !== null && (proteinFrom === null || Math.abs(proteinTo - proteinFrom) >= MIN_APPLY_PROTEIN_G);
    if (moveKcal || moveProtein) {
      if (!(await setTargets({ ...(moveKcal ? { calorieTarget: to } : {}), ...(moveProtein ? { proteinTarget: proteinTo! } : {}) }))) return null;
      if (moveKcal) changes.push({ label: "Daily calories", from: from === null ? null : kcal(from), to: kcal(to) });
      if (moveProtein) changes.push({ label: "Daily protein", from: proteinFrom === null ? null : `${proteinFrom} g`, to: `${proteinTo} g` });
    }

    const rebuilt = changes.length > 0 ? (await rebuildPlan(ctx, "Goal date changed", now).catch(() => ({ ok: false as const }))).ok : false;
    if (rebuilt) changes.push({ label: "Meal plan", from: null, to: "Rebuilt for the new target" });

    return {
      changed: changes.length > 0,
      calorieTarget: { from, to },
      plannedKgPerWeek: planned,
      neededKgPerWeek: needed,
      cappedForSafety: capped,
      safeDate,
      source,
      mealPlanRebuilt: rebuilt,
      changes,
      lines: replanLines({ deadline: goal.deadline, targetWeightKg: goal.targets.weight_kg ?? null, weeksLeft, from, to, plannedKgPerWeek: planned, neededKgPerWeek: needed, capped, safeDate }),
    };
  } catch (err) {
    logger.warn({ err: loggableError(err) }, "re-plan after goal change failed");
    return null;
  }
}
