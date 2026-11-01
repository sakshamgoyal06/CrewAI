/**
 * North-star metric for the health app: **on-track days in the last 7**.
 *
 * A day is on-track when every check that applies to it is met. Checks are deterministic so the
 * number never depends on an LLM, and each one is something the user controls that same day.
 */

export type DayInputs = {
  /** YYYY-MM-DD in the user's timezone. */
  date: string;
  /** 0 = Sunday … 6 = Saturday, for `date`. */
  weekday: number;
  mealSessions: number;
  calories: number;
  proteinG: number;
  steps: number;
  workoutsLogged: number;
};

export type HealthTargets = {
  calorieTarget: number | null;
  proteinTarget: number | null;
  stepTarget: number;
  /** Weekdays with a planned workout; empty means every day is a rest day for scoring. */
  trainingDays: number[];
  minMealSessions: number;
};

export type CheckId = "meals_logged" | "calories" | "protein" | "steps" | "workout";

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
  /** 0–100, mean progress across applicable checks. */
  score: number;
};

export const DEFAULT_STEP_TARGET = 8000;
export const DEFAULT_MIN_MEAL_SESSIONS = 3;
export const WEEKLY_ON_TRACK_GOAL = 5;
/** Below this share of the calorie target the day looks under-logged, not disciplined. */
const CALORIE_FLOOR_RATIO = 0.6;

function clamp01(n: number): number {
  if (!Number.isFinite(n)) {
    return 0;
  }
  return Math.max(0, Math.min(1, n));
}

export function scoreDay(day: DayInputs, targets: HealthTargets): DayScore {
  const checks: DayCheck[] = [];

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

  checks.push({
    id: "steps",
    label: "Steps",
    met: day.steps >= targets.stepTarget,
    progress: clamp01(day.steps / targets.stepTarget),
    detail: `${day.steps.toLocaleString("en-US")} / ${targets.stepTarget.toLocaleString("en-US")}`,
  });

  if (targets.trainingDays.includes(day.weekday)) {
    checks.push({
      id: "workout",
      label: "Workout",
      met: day.workoutsLogged > 0,
      progress: day.workoutsLogged > 0 ? 1 : 0,
      detail: day.workoutsLogged > 0 ? "Logged in Hevy" : "Planned, not logged yet",
    });
  }

  const score = Math.round(
    (checks.reduce((s, c) => s + c.progress, 0) / checks.length) * 100,
  );
  return { date: day.date, checks, onTrack: checks.every((c) => c.met), score };
}

export type NorthStar = {
  onTrackDays: number;
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
  return { onTrackDays, windowDays: days.length, goal, days, mostMissed };
}
