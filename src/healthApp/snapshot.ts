/**
 * Builds the health app's main payload: today's checks, the 7-day north star, and recent Hevy
 * workouts. Reads the same tables and Hevy client the Telegram bot uses.
 */
import { localDateKey, resolveTimezone } from "../nutrition/localDate.js";
import {
  fetchHevyWorkoutsPage,
  hevyApiKeyForUser,
  type HevyWorkout,
} from "../pillars/health/workouts/hevy/index.js";
import { supabase } from "../tools/clients.js";
import { trainingActivity, typicalTrainingBurn, type Activity } from "./activities.js";
import { FALLBACK_WEIGHT_KG, getActivities } from "./activityLog.js";
import { getActivityRange, type DailyActivity } from "./activityStore.js";
import { getActiveGoal, getBodyCheckins } from "./bodyStore.js";
import { computeGoalProgress, type BodyCheckin, type GoalProgress } from "./goalProgress.js";
import { checkTime, DEFAULT_CHECK_DELAY_MIN } from "./gymSlot.js";
import { listMealsForDate } from "./meals.js";
import type { DayMeals } from "./dayMeals.js";
import { loadDayMeals } from "./dayMealsStore.js";
import { routineDayStatus, trainingDaysOf, type RoutineItem, type RoutineItemStatus } from "./routine.js";
import { checksOn, getRoutineChecks, loadRoutine } from "./routineStore.js";
import { getWorkoutChecks, type WorkoutCheck } from "./workoutCheckStore.js";
import {
  computeNorthStar,
  DEFAULT_MIN_MEAL_SESSIONS,
  DEFAULT_STEP_TARGET,
  scoreDay,
  type DayScore,
  type HealthTargets,
  type NorthStar,
} from "./northStar.js";
import { DAY_MS } from "../util/time.js";

const WINDOW_DAYS = 7;

export type WorkoutSummary = {
  id: string | null;
  title: string;
  localDate: string;
  startTime: string | null;
  durationMin: number | null;
  exerciseCount: number;
};

export type HealthSnapshot = {
  timezone: string;
  today: DayScore & {
    calories: number;
    proteinG: number;
    steps: number;
    /** Steps sync from the phone (Health Connect): the coach never asks for a step count. */
    stepsFromPhone: boolean;
    /** Last Health Connect write for today; null when none came today. */
    phoneSyncedAt?: string | null;
    walkMinutes: number | null;
    /** Last night's sleep and today's resting heart rate, when Health Connect has them. */
    sleepMinutes: number | null;
    restingHr: number | null;
    /** Total calories burned today incl. resting metabolism, and HRV, when Health Connect has them. */
    totalKcal: number | null;
    hrvMs: number | null;
    isTrainingDay: boolean;
    /** Today's routine items, in time order, with done / skipped / pending. */
    routine: RoutineItemStatus[];
  };
  /** The weekly routine (empty when none is set). */
  routine: RoutineItem[];
  northStar: NorthStar;
  targets: HealthTargets;
  workouts: WorkoutSummary[];
  hevyConnected: boolean;
  /** Gym slot on training days and when the automatic Hevy check runs (local "HH:MM"). */
  gym: { time: string | null; checkDelayMin: number; checkAt: string | null };
  /** Post-gym-slot checks in the 7-day window, newest first. */
  workoutChecks: WorkoutCheck[];
  /** Routine items and gym sessions skipped in the 7-day window, newest first, with their reason. */
  recentSkips: Array<{ localDate: string; label: string; reason: string | null }>;
  goal: GoalProgress | null;
  /** Body check-ins for the last ~6 months, oldest first, for the trend chart. */
  checkins: BodyCheckin[];
  /** Non-Hevy activities (swims, runs, sports) in the 7-day window, oldest first. */
  activities: Activity[];
  meals: Array<{
    mealSessionId: string;
    slot: string;
    text: string;
    calories: number;
    proteinG: number;
    loggedAt: string;
  }>;
  /** Today's one meal list (dayMeals.ts): planned meals with their state, plus extras. */
  mealList?: DayMeals;
};

const CHECKIN_HISTORY_DAYS = 180;

/** Local dates oldest → newest, ending today. */
/**
 * What was skipped this week and why, newest first: skipped routine items (a gym item carries its
 * Hevy check's reason), plus skipped gym checks on days without a routine item for them.
 */
export function recentSkips(
  routineByDate: Map<string, RoutineItemStatus[]>,
  checks: WorkoutCheck[],
): Array<{ localDate: string; label: string; reason: string | null }> {
  const out: Array<{ localDate: string; label: string; reason: string | null }> = [];
  for (const [date, items] of routineByDate) {
    for (const i of items) {
      if (i.state !== "skipped") continue;
      const reason = i.detail?.startsWith("Skipped · ") ? i.detail.slice("Skipped · ".length) : null;
      out.push({ localDate: date, label: i.label, reason });
    }
  }
  for (const c of checks) {
    if (c.status !== "skipped") continue;
    if ((routineByDate.get(c.localDate) ?? []).some((i) => i.gym)) continue;
    out.push({ localDate: c.localDate, label: "Gym", reason: c.reason });
  }
  return out.sort((a, b) => b.localDate.localeCompare(a.localDate));
}

export function windowDates(now: Date, timezone: string, days = WINDOW_DAYS): string[] {
  const out: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    out.push(localDateKey(new Date(now.getTime() - i * DAY_MS), timezone));
  }
  return [...new Set(out)];
}

export function weekdayOfDate(date: string): number {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

export async function loadHealthProfile(
  userProfileId: string,
): Promise<{
  timezone: string;
  targets: HealthTargets;
  gym: { time: string | null; checkDelayMin: number };
  /** The weekly routine; null when the routine table isn't there yet (legacy gym slot only). */
  routine: RoutineItem[] | null;
}> {
  const [profile, health, routineRows, weighIn] = await Promise.all([
    supabase.from("user_profile").select("timezone").eq("id", userProfileId).maybeSingle(),
    supabase
      .from("user_health_profile")
      .select(
        "daily_calorie_target, daily_protein_g_target, daily_step_target, training_days, gym_time, workout_check_delay_min",
      )
      .eq("user_profile_id", userProfileId)
      .maybeSingle(),
    loadRoutine(userProfileId).catch(() => null),
    // Its own read, so a database without the column yet still loads every other setting.
    Promise.resolve(
      supabase.from("user_health_profile").select("weigh_in_day").eq("user_profile_id", userProfileId).maybeSingle(),
    ).then((r) => (r.error ? null : (r.data as { weigh_in_day?: unknown } | null)?.weigh_in_day ?? null), () => null),
  ]);
  // A failed read must not quietly become UTC: every "today" downstream (day plan, checks,
  // nudges) would be computed on the wrong day.
  if (profile.error) throw new Error(`profile timezone: ${profile.error.message}`);
  const h = (health.data ?? {}) as Record<string, unknown>;
  const num = (v: unknown): number | null => {
    const n = typeof v === "number" ? v : Number(v);
    return v === null || v === undefined || !Number.isFinite(n) || n <= 0 ? null : n;
  };
  const routine = routineRows;
  // With a routine, it decides the training days; otherwise the stored list does.
  const trainingDays = routine && routine.length
    ? trainingDaysOf(routine)
    : Array.isArray(h.training_days)
      ? h.training_days.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
      : [];
  return {
    timezone: resolveTimezone((profile.data as { timezone?: string } | null)?.timezone),
    targets: {
      calorieTarget: num(h.daily_calorie_target),
      proteinTarget: num(h.daily_protein_g_target),
      stepTarget: num(h.daily_step_target) ?? DEFAULT_STEP_TARGET,
      trainingDays,
      minMealSessions: DEFAULT_MIN_MEAL_SESSIONS,
      weighInDay: typeof weighIn === "number" && Number.isInteger(weighIn) && weighIn >= 0 && weighIn <= 6 ? weighIn : null,
    },
    gym: {
      time: typeof h.gym_time === "string" && /^\d{2}:\d{2}/.test(h.gym_time) ? h.gym_time.slice(0, 5) : null,
      checkDelayMin: num(h.workout_check_delay_min) ?? DEFAULT_CHECK_DELAY_MIN,
    },
    routine,
  };
}

type MealDay = { sessions: Set<string>; calories: number; proteinG: number; carbsG: number; fatG: number };

export async function loadMealDays(
  userProfileId: string,
  fromDate: string,
  toDate: string,
): Promise<Map<string, MealDay>> {
  const { data, error } = await supabase
    .from("meal_logs")
    .select("local_date, meal_session_id, calories, protein_g, carbs_g, fat_g")
    .eq("user_profile_id", userProfileId)
    .is("deleted_at", null)
    .gte("local_date", fromDate)
    .lte("local_date", toDate);
  const out = new Map<string, MealDay>();
  if (error || !data) {
    return out;
  }
  for (const r of data) {
    const key = String(r.local_date);
    const day = out.get(key) ?? { sessions: new Set<string>(), calories: 0, proteinG: 0, carbsG: 0, fatG: 0 };
    if (r.meal_session_id) {
      day.sessions.add(String(r.meal_session_id));
    }
    day.calories += Number(r.calories) || 0;
    day.proteinG += Number(r.protein_g) || 0;
    day.carbsG += Number(r.carbs_g) || 0;
    day.fatG += Number(r.fat_g) || 0;
    out.set(key, day);
  }
  return out;
}

export function summarizeWorkout(w: HevyWorkout, timezone: string): WorkoutSummary | null {
  if (!w.start_time) {
    return null;
  }
  const start = new Date(w.start_time);
  if (Number.isNaN(start.getTime())) {
    return null;
  }
  const end = w.end_time ? new Date(w.end_time) : null;
  const durationMin =
    end && !Number.isNaN(end.getTime())
      ? Math.max(0, Math.round((end.getTime() - start.getTime()) / 60_000))
      : null;
  return {
    id: w.id ?? null,
    title: w.title?.trim() || "Workout",
    localDate: localDateKey(start, timezone),
    startTime: w.start_time,
    durationMin,
    exerciseCount: w.exercises?.length ?? 0,
  };
}

/** `fetched` is false when Hevy is connected but the request failed, so an empty list means nothing. */
export async function loadRecentWorkouts(
  userProfileId: string,
  timezone: string,
): Promise<{ connected: boolean; fetched: boolean; workouts: WorkoutSummary[] }> {
  const apiKey = await hevyApiKeyForUser(userProfileId);
  if (!apiKey) {
    return { connected: false, fetched: false, workouts: [] };
  }
  const page = await fetchHevyWorkoutsPage(apiKey, 1, 10);
  if (!page.ok) {
    return { connected: true, fetched: false, workouts: [] };
  }
  const workouts = (page.data.workouts ?? [])
    .map((w) => summarizeWorkout(w, timezone))
    .filter((w): w is WorkoutSummary => w !== null);
  return { connected: true, fetched: true, workouts };
}

/**
 * The tracker refreshes after every log; Hevy is a slow external call, so reuse a fetch from the
 * last minute. Failed fetches are not cached.
 */
const HEVY_SNAPSHOT_CACHE_MS = 60 * 1000;
const hevySnapshotCache = new Map<string, { at: number; value: Awaited<ReturnType<typeof loadRecentWorkouts>> }>();
async function recentWorkoutsCached(userProfileId: string, timezone: string) {
  const key = `${userProfileId}|${timezone}`;
  const hit = hevySnapshotCache.get(key);
  if (hit && Date.now() - hit.at < HEVY_SNAPSHOT_CACHE_MS) return hit.value;
  const value = await loadRecentWorkouts(userProfileId, timezone);
  if (value.fetched) hevySnapshotCache.set(key, { at: Date.now(), value });
  return value;
}

export async function buildHealthSnapshot(
  userProfileId: string,
  now = new Date(),
): Promise<HealthSnapshot> {
  const { timezone, targets, gym, routine } = await loadHealthProfile(userProfileId);
  const dates = windowDates(now, timezone);
  const from = dates[0]!;
  const to = dates[dates.length - 1]!;

  const historyFrom = localDateKey(new Date(now.getTime() - CHECKIN_HISTORY_DAYS * DAY_MS), timezone);
  const [meals, activity, hevy, goal, checkins, todayMealList, workoutChecks, activities, routineChecks] = await Promise.all([
    loadMealDays(userProfileId, from, to),
    getActivityRange(userProfileId, from, to),
    recentWorkoutsCached(userProfileId, timezone),
    getActiveGoal(userProfileId),
    getBodyCheckins(userProfileId, historyFrom),
    listMealsForDate(userProfileId, to),
    getWorkoutChecks(userProfileId, from, to),
    getActivities(userProfileId, from, to),
    routine?.length ? getRoutineChecks(userProfileId, from, to) : Promise.resolve(new Map()),
  ]);
  const mealList = await loadDayMeals(userProfileId, to, to).catch(() => undefined);
  const kg = [...checkins].reverse().find((c) => c.weight_kg != null)?.weight_kg ?? FALLBACK_WEIGHT_KG;
  const typicalBurn = typicalTrainingBurn(hevy.workouts.map((w) => w.durationMin ?? 0), kg);

  const workoutsByDate = new Map<string, number>();
  for (const w of hevy.workouts) {
    workoutsByDate.set(w.localDate, (workoutsByDate.get(w.localDate) ?? 0) + 1);
  }
  // "Trained but didn't log it in Hevy" still counts as the day's workout.
  for (const c of workoutChecks.values()) {
    if (c.status === "trained_unlogged" && !workoutsByDate.has(c.localDate)) {
      workoutsByDate.set(c.localDate, 1);
    }
  }

  const routineByDate = new Map<string, RoutineItemStatus[]>();
  const days = dates.map((date) => {
    const m = meals.get(date);
    const a: DailyActivity | undefined = activity.get(date);
    const logged = workoutsByDate.get(date) ?? 0;
    const dayActs = activities.filter((x) => x.localDate === date);
    const sport = logged ? null : trainingActivity(dayActs, [], typicalBurn);
    const check = workoutChecks.get(date);
    const dayRoutine = routine?.length
      ? routineDayStatus(routine, weekdayOfDate(date), {
          workouts: logged,
          gymSkipped: check?.status === "skipped" ? { reason: check.reason } : null,
          sport,
          activities: dayActs,
          walkMinutes: a?.walkMinutes ?? null,
          checks: checksOn(routineChecks, date),
          date,
          timezone,
        })
      : [];
    routineByDate.set(date, dayRoutine);
    return scoreDay(
      {
        date,
        weekday: weekdayOfDate(date),
        mealSessions: m?.sessions.size ?? 0,
        calories: m?.calories ?? 0,
        proteinG: m?.proteinG ?? 0,
        carbsG: m?.carbsG ?? 0,
        fatG: m?.fatG ?? 0,
        steps: a?.steps ?? 0,
        workoutsLogged: logged,
        sportLabel: sport ? `${sport.label} · ${sport.durationMin} min` : null,
        routine: dayRoutine,
      },
      { ...targets, weightKg: kg },
    );
  });

  const todayScore = days[days.length - 1]!;
  const todayMeals = meals.get(to);
  const todayActivity = activity.get(to);

  return {
    timezone,
    today: {
      ...todayScore,
      calories: Math.round(todayMeals?.calories ?? 0),
      proteinG: Math.round(todayMeals?.proteinG ?? 0),
      steps: todayActivity?.steps ?? 0,
      stepsFromPhone: [...activity.values()].some((x) => x.source === "health_connect"),
      phoneSyncedAt: todayActivity?.source === "health_connect" ? (todayActivity.updatedAt ?? null) : null,
      walkMinutes: todayActivity?.walkMinutes ?? null,
      sleepMinutes: todayActivity?.sleepMinutes ?? null,
      restingHr: todayActivity?.restingHr ?? null,
      totalKcal: todayActivity?.totalKcal ?? null,
      hrvMs: todayActivity?.hrvMs ?? null,
      isTrainingDay: targets.trainingDays.includes(weekdayOfDate(to)),
      routine: routineByDate.get(to) ?? [],
    },
    routine: routine ?? [],
    northStar: computeNorthStar(days),
    targets,
    workouts: hevy.workouts,
    hevyConnected: hevy.connected,
    gym: { ...gym, checkAt: checkTime(gym) },
    workoutChecks: [...workoutChecks.values()].sort((a, b) => b.localDate.localeCompare(a.localDate)),
    recentSkips: recentSkips(routineByDate, [...workoutChecks.values()]),
    goal: goal ? computeGoalProgress(goal, checkins, to, targets.weighInDay) : null,
    checkins,
    activities,
    meals: todayMealList.map((m) => ({
      mealSessionId: m.mealSessionId,
      slot: m.mealSlot,
      text: m.rawText,
      calories: Math.round(m.calories),
      proteinG: Math.round(m.protein_g),
      loggedAt: m.loggedAt,
    })),
    ...(mealList ? { mealList } : {}),
  };
}
