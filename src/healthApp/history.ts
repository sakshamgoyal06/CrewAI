/**
 * Day-by-day history for the tracker: meals with their items and macros, steps, calories burned,
 * and Hevy workouts with every exercise and set. One request covers the whole range, so tapping
 * between days and charts on the phone needs no further round trips.
 */
import { localDateKey } from "../nutrition/localDate.js";
import type { HevyWorkout } from "../pillars/health/workouts/hevy/index.js";
import { supabase } from "../tools/clients.js";
import { burnForDay, trainingActivity, typicalTrainingBurn, type Activity, type Burn, type NotCounted, type StepBucket, type TimedWorkout } from "./activities.js";
import { FALLBACK_WEIGHT_KG, getActivities } from "./activityLog.js";
import { getBodyCheckins } from "./bodyStore.js";
import { hevyHistoryCached, withinAnalysisWindow } from "./hevyHistory.js";
import { getWaterByDate, waterTargetMl } from "./water.js";
import { scoreDay, type DayCheck, type HealthTargets } from "./northStar.js";
import { loadHealthProfile, weekdayOfDate, windowDates } from "./snapshot.js";
import { getWorkoutChecks } from "./workoutCheckStore.js";
import { routineDayStatus, type RoutineItemStatus } from "./routine.js";
import { checksOn, getRoutineChecks } from "./routineStore.js";
import { DAY_MS } from "../util/time.js";
import { buildDayMeals, groupMeals, type DayMeals, type MealRow } from "./dayMeals.js";
export { groupMeals } from "./dayMeals.js";
import { loadPlanEntries } from "./dayMealsStore.js";

export const DEFAULT_HISTORY_DAYS = 30;
/** 12 weeks, for the Progress charts' weekly view. */
export const MAX_HISTORY_DAYS = 84;
export { stepsBurn, workoutBurn, burnForDay } from "./activities.js";
export type { Burn } from "./activities.js";

export type MacroItem = { name: string; calories: number; proteinG: number; carbsG: number; fatG: number };

export type HistoryMeal = MacroItem & {
  mealSessionId: string;
  slot: string;
  text: string;
  loggedAt: string;
  items: MacroItem[];
};

export type HistorySet = {
  type: string;
  weightKg: number | null;
  reps: number | null;
  durationS: number | null;
  distanceM: number | null;
};

export type HistoryWorkout = {
  id: string | null;
  title: string;
  startTime: string;
  durationMin: number | null;
  volumeKg: number;
  setCount: number;
  exercises: Array<{ title: string; sets: HistorySet[] }>;
};

export type HistoryActivity = Activity & { counted: boolean; why: NotCounted };

export type HistoryDay = {
  date: string;
  weekday: number;
  isTrainingDay: boolean;
  onTrack: boolean;
  score: number;
  checks: DayCheck[];
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  meals: HistoryMeal[];
  steps: number;
  walkMinutes: number | null;
  distanceM: number | null;
  /** From Health Connect: minutes asleep (credited to the wake-up day) and resting heart rate. */
  sleepMinutes: number | null;
  restingHr: number | null;
  /** Health Connect's total calories burned (resting metabolism included) and average HRV. */
  totalKcal: number | null;
  hrvMs: number | null;
  burn: Burn | null;
  workouts: HistoryWorkout[];
  /** Swims, runs, sports... (not Hevy), with whether each counts toward the day's burn. */
  activities: HistoryActivity[];
  /** The activity that stood in for the day's training, e.g. "Football · 60 min". */
  sportCounted: string | null;
  /** "Trained, didn't log it in Hevy" from the post-gym check. */
  trainedUnlogged: boolean;
  /** Routine items planned that day, with done / skipped / pending. */
  routine: RoutineItemStatus[];
  /** Water logged that day, in ml. */
  waterMl: number;
  /** The day's one meal list: planned meals with their state, plus extras (dayMeals.ts). */
  mealList: DayMeals;
};

export type HealthHistory = {
  timezone: string;
  today: string;
  targets: HealthTargets;
  bodyWeightKg: number | null;
  hevy: "connected" | "not_connected" | "unavailable";
  /** Daily water goal in ml (from body weight). */
  waterTargetMl: number;
  days: HistoryDay[];
};

const n = (v: unknown): number => {
  const x = typeof v === "number" ? v : Number(v);
  return Number.isFinite(x) ? x : 0;
};
const nOrNull = (v: unknown): number | null => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const r1 = (x: number) => Math.round(x * 10) / 10;

/** A Hevy workout with every exercise and set, plus total volume (kg × reps over working sets). */
export function detailWorkout(w: HevyWorkout): HistoryWorkout | null {
  if (!w.start_time || Number.isNaN(Date.parse(w.start_time))) return null;
  const start = Date.parse(w.start_time);
  const end = w.end_time ? Date.parse(w.end_time) : NaN;
  let volume = 0;
  let setCount = 0;
  const exercises = (w.exercises ?? [])
    .slice()
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map((e) => ({
      title: e.title?.trim() || "Exercise",
      sets: (e.sets ?? [])
        .slice()
        .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
        .map((s) => {
          const set: HistorySet = {
            type: s.type ?? "normal",
            weightKg: nOrNull(s.weight_kg),
            reps: nOrNull(s.reps),
            durationS: nOrNull(s.duration_seconds),
            distanceM: nOrNull(s.distance_meters),
          };
          if (set.type !== "warmup") {
            setCount += 1;
            volume += (set.weightKg ?? 0) * (set.reps ?? 0);
          }
          return set;
        }),
    }));
  return {
    id: w.id ?? null,
    title: w.title?.trim() || "Workout",
    startTime: w.start_time,
    durationMin: Number.isFinite(end) && end > start ? Math.round((end - start) / 60_000) : null,
    volumeKg: Math.round(volume),
    setCount,
    exercises,
  };
}

export function clampDays(v: unknown): number {
  const d = Math.round(Number(v));
  return Number.isFinite(d) && d >= 1 ? Math.min(d, MAX_HISTORY_DAYS) : DEFAULT_HISTORY_DAYS;
}

export async function buildHealthHistory(
  userProfileId: string,
  opts: { days?: number; now?: Date } = {},
): Promise<HealthHistory> {
  const now = opts.now ?? new Date();
  const { timezone, targets, routine } = await loadHealthProfile(userProfileId);
  const dates = windowDates(now, timezone, clampDays(opts.days));
  const from = dates[0]!;
  const to = dates[dates.length - 1]!;

  const [mealRes, activityRes, hevy, checkins, workoutChecks, activities, stepRes, routineChecks, water] = await Promise.all([
    supabase
      .from("meal_logs")
      .select("meal_session_id, local_date, meal_slot, raw_text, description, calories, protein_g, carbs_g, fat_g, logged_at, created_at, component_index")
      .eq("user_profile_id", userProfileId)
      .is("deleted_at", null)
      .gte("local_date", from)
      .lte("local_date", to),
    // `*`: active_kcal arrives with a later migration; a missing column must not break the view.
    supabase.from("health_daily_activity").select("*").eq("user_profile_id", userProfileId).gte("local_date", from).lte("local_date", to),
    hevyHistoryCached(userProfileId, { now }),
    getBodyCheckins(userProfileId, localDateKey(new Date(now.getTime() - 180 * DAY_MS), timezone)),
    getWorkoutChecks(userProfileId, from, to),
    getActivities(userProfileId, from, to),
    supabase
      .from("health_activity_samples")
      .select("local_date, start_time, end_time, value")
      .eq("user_profile_id", userProfileId)
      .eq("kind", "steps")
      .gte("local_date", from)
      .lte("local_date", to),
    routine?.length ? getRoutineChecks(userProfileId, from, to) : Promise.resolve(new Map()),
    getWaterByDate(userProfileId, from, to).catch(() => new Map<string, number>()),
  ]);
  const planned = await loadPlanEntries(userProfileId, from, to).catch(() => null);
  const actsByDate = new Map<string, Activity[]>();
  for (const a of activities) actsByDate.set(a.localDate, [...(actsByDate.get(a.localDate) ?? []), a]);
  const bucketsByDate = new Map<string, StepBucket[]>();
  for (const r of (stepRes.data ?? []) as Array<Record<string, unknown>>) {
    const d = String(r.local_date);
    bucketsByDate.set(d, [...(bucketsByDate.get(d) ?? []), { startTime: String(r.start_time), endTime: String(r.end_time), count: Number(r.value) || 0 }]);
  }

  const meals = groupMeals((mealRes.data ?? []) as MealRow[]);
  const activity = new Map<string, Record<string, unknown>>();
  for (const r of (activityRes.data ?? []) as Record<string, unknown>[]) activity.set(String(r.local_date), r);

  const workouts = new Map<string, HistoryWorkout[]>();
  if (hevy.connected && hevy.ok) {
    for (const w of hevy.workouts) {
      const d = detailWorkout(w);
      if (!d) continue;
      const date = localDateKey(new Date(d.startTime), timezone);
      if (date < from || date > to) continue;
      const list = workouts.get(date) ?? [];
      list.push(d);
      workouts.set(date, list);
    }
  }

  const weightKg = [...checkins].reverse().find((c) => c.weight_kg != null)?.weight_kg ?? null;
  const kg = weightKg ?? FALLBACK_WEIGHT_KG;
  const allMinutes = hevy.connected && hevy.ok
    ? withinAnalysisWindow(hevy.workouts, now).map((w) => (w.start_time && w.end_time ? Math.round((Date.parse(w.end_time) - Date.parse(w.start_time)) / 60_000) : 0))
    : [];
  const typicalBurn = typicalTrainingBurn(allMinutes, kg);

  const days: HistoryDay[] = dates.map((date) => {
    const dayMeals = meals.get(date) ?? [];
    const a = activity.get(date);
    const dayWorkouts = (workouts.get(date) ?? []).sort((x, y) => x.startTime.localeCompare(y.startTime));
    const trainedUnlogged = workoutChecks.get(date)?.status === "trained_unlogged";
    const calories = dayMeals.reduce((t, m) => t + m.calories, 0);
    const proteinG = r1(dayMeals.reduce((t, m) => t + m.proteinG, 0));
    const steps = n(a?.steps);
    const weekday = weekdayOfDate(date);
    const dayActs = actsByDate.get(date) ?? [];
    const timed: TimedWorkout[] = dayWorkouts.map((w) => ({ startTime: w.startTime, durationMin: w.durationMin }));
    const isTraining = targets.trainingDays.includes(weekday);
    const sport = isTraining && !dayWorkouts.length && !trainedUnlogged ? trainingActivity(dayActs, timed, typicalBurn) : null;
    const sportCounted = sport ? `${sport.label} · ${sport.durationMin} min` : null;
    const check = workoutChecks.get(date);
    const dayRoutine: RoutineItemStatus[] = routine?.length
      ? routineDayStatus(routine, weekday, {
          workouts: dayWorkouts.length || (trainedUnlogged ? 1 : 0),
          gymSkipped: check?.status === "skipped" ? { reason: check.reason } : null,
          sport,
          activities: dayActs,
          walkMinutes: nOrNull(a?.walk_minutes),
          checks: checksOn(routineChecks, date),
        })
      : [];
    const burn: Burn | null = burnForDay({
      activeKcal: nOrNull(a?.active_kcal),
      steps,
      workouts: timed,
      activities: dayActs,
      stepBuckets: bucketsByDate.get(date),
      weightKg: kg,
    });
    const lines = new Map((burn?.activities ?? []).map((l) => [l.id, l]));
    const score = scoreDay(
      {
        date,
        weekday,
        mealSessions: dayMeals.length,
        calories,
        proteinG,
        carbsG: dayMeals.reduce((t, m) => t + m.carbsG, 0),
        fatG: dayMeals.reduce((t, m) => t + m.fatG, 0),
        steps,
        workoutsLogged: dayWorkouts.length || (trainedUnlogged ? 1 : 0),
        sportLabel: sportCounted,
        routine: dayRoutine,
      },
      { ...targets, weightKg: kg },
    );
    return {
      date,
      weekday,
      isTrainingDay: targets.trainingDays.includes(weekday),
      onTrack: score.onTrack,
      score: score.score,
      checks: score.checks,
      calories,
      proteinG,
      carbsG: r1(dayMeals.reduce((t, m) => t + m.carbsG, 0)),
      fatG: r1(dayMeals.reduce((t, m) => t + m.fatG, 0)),
      meals: dayMeals,
      steps,
      walkMinutes: nOrNull(a?.walk_minutes),
      distanceM: nOrNull(a?.walk_distance_m),
      sleepMinutes: nOrNull(a?.sleep_minutes),
      restingHr: nOrNull(a?.resting_hr),
      totalKcal: nOrNull(a?.total_kcal),
      hrvMs: nOrNull(a?.hrv_ms),
      burn,
      workouts: dayWorkouts,
      activities: dayActs.map((x) => ({ ...x, counted: lines.get(x.id)?.counted ?? true, why: lines.get(x.id)?.why ?? null })),
      sportCounted,
      trainedUnlogged,
      routine: dayRoutine,
      waterMl: water.get(date) ?? 0,
      mealList: buildDayMeals({ date, today: to, plan: planned ? planned.byDate.get(date) ?? [] : null, logs: dayMeals, times: planned?.times }),
    };
  });

  return {
    timezone,
    today: to,
    targets,
    bodyWeightKg: weightKg,
    hevy: !hevy.connected ? "not_connected" : hevy.ok ? "connected" : "unavailable",
    waterTargetMl: waterTargetMl(weightKg),
    days,
  };
}

