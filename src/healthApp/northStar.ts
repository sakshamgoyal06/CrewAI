/**
 * North-star metric for the health app: **on-track days in the last 7**.
 *
 * A day is on-track when every check that applies to it is met. Checks are deterministic so the
 * number never depends on an LLM, and each one is something the user controls that same day.
 */

import { macroTargets } from "./dietPlan/targets.js";

export type DayInputs = {
  /** YYYY-MM-DD in the user's timezone. */
  date: string;
  /** 0 = Sunday … 6 = Saturday, for `date`. */
  weekday: number;
  mealSessions: number;
  calories: number;
  proteinG: number;
  /** When given (and the day is on the food rule), carbs and fat are checked against their targets. */
  carbsG?: number;
  fatG?: number;
  steps: number;
  workoutsLogged: number;
  /** A sport that stood in for the day's training (see activities.ts), e.g. "Football · 60 min". */
  sportLabel?: string | null;
  /**
   * The routine items planned that day and whether each is done (routine.ts). When there are any,
   * they replace the workout check with one "Routine" check that needs every item done.
   */
  routine?: Array<{ label: string; state: "done" | "skipped" | "pending" }> | null;
  /**
   * Planned meals marked skipped that day. Only an explicit skip counts as eating nothing (11 Nov
   * rule): a day with skips and no logs is a logged 0, not an unlogged day.
   */
  mealsSkipped?: number;
  /**
   * Whether every meal of the day is accounted for (each planned main meal eaten, changed or
   * skipped, or "That was everything"). When not given, a day with food logged counts as partly
   * logged below PARTIAL_KCAL_SHARE of the calorie target.
   */
  loggedInFull?: boolean;
};

export type HealthTargets = {
  calorieTarget: number | null;
  proteinTarget: number | null;
  stepTarget: number;
  /** Weekdays with a planned workout; empty means every day is a rest day for scoring. */
  trainingDays: number[];
  minMealSessions: number;
  /** Weekday (0 = Sunday) the person weighs in on; null or missing means "7 days after the last one". */
  weighInDay?: number | null;
  /** Latest weight, for the fat floor in the carb and fat targets. */
  weightKg?: number | null;
};

export type CheckId = "meals_logged" | "calories" | "protein" | "macros" | "steps" | "workout" | "routine";

export type DayCheck = {
  id: CheckId;
  label: string;
  met: boolean;
  /** 0–1 progress toward the check, for the today view. */
  progress: number;
  detail: string;
};

export type DayScore = {
  date: string;
  checks: DayCheck[];
  onTrack: boolean;
  /**
   * Nothing eaten was logged (food-rule days). The food checks are replaced by one "Meals logged"
   * check, so a blank day reads as unlogged, never as missed calories or protein (11 Nov rule).
   */
  unlogged?: true;
  /**
   * Some food logged but the day isn't accounted for in full. The food checks stay (with "partly
   * logged" in their detail), but they are counted as a logging gap, not as eating too little.
   */
  partial?: true;
  /** 0–100, mean progress across applicable checks. */
  score: number;
};

export const DEFAULT_STEP_TARGET = 8000;
export const DEFAULT_MIN_MEAL_SESSIONS = 3;
export const WEEKLY_ON_TRACK_GOAL = 5;
/** Below this share of the calorie target the day looks under-logged, not disciplined. */
const CALORIE_FLOOR_RATIO = 0.6;

/**
 * The food rule from this date (Saksham, 2026-11-04): calories and macros, not meal count.
 * Calories 85–105% of target, protein at least 90%, carbs and fat each within 25% of theirs.
 * Earlier days keep the old rule (3 meals logged, calories 60–100%, protein 100%), so past
 * weeks don't change under people.
 */
export const FOOD_RULE_FROM = "2026-11-05";
export const FOOD_BAND = { kcalLow: 0.85, kcalHigh: 1.05, protein: 0.9, macro: 0.25 } as const;
/** Without plan data, a day with less than this share of the calorie target logged reads as partly logged. */
export const PARTIAL_KCAL_SHARE = 0.5;
const FOOD_CHECKS: CheckId[] = ["calories", "protein", "macros"];

/** Is the food side of this day logged in full, partly, or not at all? Pure. */
export function foodLogState(day: DayInputs, targets: HealthTargets): "full" | "partial" | "none" {
  const skipped = day.mealsSkipped ?? 0;
  if (day.mealSessions === 0 && day.calories <= 0) return skipped > 0 ? "full" : "none";
  if (day.loggedInFull !== undefined) return day.loggedInFull ? "full" : "partial";
  const t = targets.calorieTarget;
  if (skipped === 0 && t && t > 0 && day.calories < t * PARTIAL_KCAL_SHARE) return "partial";
  return "full";
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) {
    return 0;
  }
  return Math.max(0, Math.min(1, n));
}

/** The food checks before FOOD_RULE_FROM. */
function legacyFoodChecks(day: DayInputs, targets: HealthTargets, checks: DayCheck[]): void {
  checks.push({
    id: "meals_logged",
    label: "Meals logged",
    met: day.mealSessions >= targets.minMealSessions,
    progress: clamp01(day.mealSessions / targets.minMealSessions),
    detail: `${day.mealSessions}/${targets.minMealSessions} meals`,
  });

  if (targets.calorieTarget && targets.calorieTarget > 0) {
    const floor = targets.calorieTarget * CALORIE_FLOOR_RATIO;
    const within = day.calories >= floor && day.calories <= targets.calorieTarget;
    const progress =
      day.calories > targets.calorieTarget
        ? clamp01(targets.calorieTarget / day.calories)
        : clamp01(day.calories / floor);
    checks.push({
      id: "calories",
      label: "Calories in range",
      met: within,
      progress,
      detail: `${Math.round(day.calories)} / ${targets.calorieTarget} kcal`,
    });
  }

  if (targets.proteinTarget && targets.proteinTarget > 0) {
    checks.push({
      id: "protein",
      label: "Protein",
      met: day.proteinG >= targets.proteinTarget,
      progress: clamp01(day.proteinG / targets.proteinTarget),
      detail: `${Math.round(day.proteinG)} / ${targets.proteinTarget} g`,
    });
  }
}

/** Calories 85–105%, protein ≥ 90%, carbs and fat within 25% (FOOD_BAND). */
function foodChecks(day: DayInputs, targets: HealthTargets, checks: DayCheck[]): void {
  const t = targets.calorieTarget && targets.calorieTarget > 0 ? targets.calorieTarget : null;
  if (t) {
    const low = t * FOOD_BAND.kcalLow;
    const high = t * FOOD_BAND.kcalHigh;
    checks.push({
      id: "calories",
      label: "Calories in range",
      met: day.calories >= low && day.calories <= high,
      progress: day.calories > high ? clamp01(high / day.calories) : clamp01(day.calories / low),
      detail: `${Math.round(day.calories)} / ${t} kcal`,
    });
  }
  const p = targets.proteinTarget && targets.proteinTarget > 0 ? targets.proteinTarget : null;
  if (p) {
    const need = p * FOOD_BAND.protein;
    checks.push({
      id: "protein",
      label: "Protein",
      met: day.proteinG >= need,
      progress: clamp01(day.proteinG / need),
      detail: `${Math.round(day.proteinG)} / ${p} g`,
    });
  }
  if (t && p && day.carbsG !== undefined && day.fatG !== undefined) {
    const m = macroTargets({ calories: t, proteinG: p, weightKg: targets.weightKg ?? null });
    const off = (v: number, target: number) => (target > 0 ? Math.abs(v - target) / target : 0);
    const worst = Math.max(off(day.carbsG, m.carbsG), off(day.fatG, m.fatG));
    checks.push({
      id: "macros",
      label: "Carbs & fat",
      met: worst <= FOOD_BAND.macro,
      // Full at the band's edge, falling to 0 at twice the band.
      progress: clamp01(1 - Math.max(0, worst - FOOD_BAND.macro) / FOOD_BAND.macro),
      detail: `${Math.round(day.carbsG)} / ${m.carbsG} g carbs, ${Math.round(day.fatG)} / ${m.fatG} g fat`,
    });
  }
}

export function scoreDay(day: DayInputs, targets: HealthTargets): DayScore {
  const checks: DayCheck[] = [];

  const state = day.date >= FOOD_RULE_FROM ? foodLogState(day, targets) : "full";
  const unlogged = state === "none";
  const partial = state === "partial";
  if (unlogged) checks.push({ id: "meals_logged", label: "Meals logged", met: false, progress: 0, detail: "Nothing logged" });
  else if (day.date >= FOOD_RULE_FROM) foodChecks(day, targets, checks);
  else legacyFoodChecks(day, targets, checks);
  if (partial) {
    for (const c of checks) if (!c.met && FOOD_CHECKS.includes(c.id)) c.detail = `${c.detail}, partly logged`;
  }

  checks.push({
    id: "steps",
    label: "Steps",
    met: day.steps >= targets.stepTarget,
    progress: clamp01(day.steps / targets.stepTarget),
    detail: `${day.steps.toLocaleString("en-US")} / ${targets.stepTarget.toLocaleString("en-US")}`,
  });

  if (day.routine?.length) {
    const done = day.routine.filter((r) => r.state === "done").length;
    checks.push({
      id: "routine",
      label: "Routine",
      met: done === day.routine.length,
      progress: clamp01(done / day.routine.length),
      detail: day.routine.map((r) => `${r.label} ${r.state === "done" ? "done" : r.state === "skipped" ? "skipped" : "not logged"}`).join(" · "),
    });
  } else if (targets.trainingDays.includes(day.weekday)) {
    const sport = day.workoutsLogged > 0 ? null : day.sportLabel ?? null;
    const met = day.workoutsLogged > 0 || sport !== null;
    checks.push({
      id: "workout",
      label: "Workout",
      met,
      progress: met ? 1 : 0,
      detail: day.workoutsLogged > 0 ? "Logged in Hevy" : sport ? `${sport} counted` : "Planned, not logged yet",
    });
  }

  const score = Math.round(
    (checks.reduce((s, c) => s + c.progress, 0) / checks.length) * 100,
  );
  return { date: day.date, checks, onTrack: checks.every((c) => c.met), score, ...(unlogged ? { unlogged: true as const } : {}), ...(partial ? { partial: true as const } : {}) };
}

export type NorthStar = {
  onTrackDays: number;
  /** Past days in the window with nothing logged (today isn't counted until it's over). */
  unloggedDays: number;
  /** Past days in the window with food logged only in part. */
  partialDays: number;
  windowDays: number;
  goal: number;
  days: DayScore[];
  /** Check most often missed in the window — the first lead for root-cause analysis. */
  mostMissed: { id: CheckId; label: string; missedDays: number } | null;
};

/**
 * `days` oldest → newest. Today is included but only counts once it is on-track, so the number
 * can rise during the day and never drops because the day isn't over yet.
 */
export function computeNorthStar(days: DayScore[], goal = WEEKLY_ON_TRACK_GOAL): NorthStar {
  const onTrackDays = days.filter((d) => d.onTrack).length;
  const missed = new Map<CheckId, { label: string; count: number }>();
  for (const d of days.slice(0, -1)) {
    // A partly logged day's food misses are a logging gap, not low calories or protein.
    const ids = new Map<CheckId, string>();
    for (const c of d.checks) {
      if (c.met) continue;
      if (d.partial && FOOD_CHECKS.includes(c.id)) ids.set("meals_logged", "Meals logged");
      else ids.set(c.id, c.label);
    }
    for (const [id, label] of ids) {
      const prev = missed.get(id);
      missed.set(id, { label, count: (prev?.count ?? 0) + 1 });
    }
  }
  let mostMissed: NorthStar["mostMissed"] = null;
  for (const [id, v] of missed) {
    if (!mostMissed || v.count > mostMissed.missedDays) {
      mostMissed = { id, label: v.label, missedDays: v.count };
    }
  }
  const unloggedDays = days.slice(0, -1).filter((d) => d.unlogged).length;
  const partialDays = days.slice(0, -1).filter((d) => d.partial).length;
  return { onTrackDays, unloggedDays, partialDays, windowDays: days.length, goal, days, mostMissed };
}
