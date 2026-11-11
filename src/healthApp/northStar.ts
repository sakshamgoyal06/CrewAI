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
  /** The whole plan was paused that day (breaks.ts): the day drops out of the score. */
  paused?: boolean;
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
  /** The whole plan was paused (breaks.ts): no checks, not a miss, not on track. */
  paused?: true;
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
  if (day.paused) return { date: day.date, checks: [], onTrack: false, score: 0, paused: true };
  const checks: DayCheck[] = [];

  const unlogged = day.date >= FOOD_RULE_FROM && day.mealSessions === 0 && day.calories <= 0;
  if (unlogged) checks.push({ id: "meals_logged", label: "Meals logged", met: false, progress: 0, detail: "Nothing logged" });
  else if (day.date >= FOOD_RULE_FROM) foodChecks(day, targets, checks);
  else legacyFoodChecks(day, targets, checks);

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
  return { date: day.date, checks, onTrack: checks.every((c) => c.met), score, ...(unlogged ? { unlogged: true as const } : {}) };
}

export type NorthStar = {
  onTrackDays: number;
  /** Past days in the window with nothing logged (today isn't counted until it's over). */
  unloggedDays: number;
  /** Days in the window the whole plan was paused (they drop out, and the week's goal scales down). */
  pausedDays: number;
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
    for (const c of d.checks) {
      if (!c.met) {
        const prev = missed.get(c.id);
        missed.set(c.id, { label: c.label, count: (prev?.count ?? 0) + 1 });
      }
    }
  }
  let mostMissed: NorthStar["mostMissed"] = null;
  for (const [id, v] of missed) {
    if (!mostMissed || v.count > mostMissed.missedDays) {
      mostMissed = { id, label: v.label, missedDays: v.count };
    }
  }
  const unloggedDays = days.slice(0, -1).filter((d) => d.unlogged).length;
  const pausedDays = days.filter((d) => d.paused).length;
  // A paused stretch lowers the week's goal in proportion, so a holiday isn't a failed week.
  const scaled = pausedDays ? Math.max(0, Math.round((goal * (days.length - pausedDays)) / Math.max(1, days.length))) : goal;
  return { onTrackDays, unloggedDays, pausedDays, windowDays: days.length, goal: scaled, days, mostMissed };
}
