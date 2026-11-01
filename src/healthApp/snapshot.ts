/**
 * Builds the health app's main payload: today's checks, the 7-day north star, and recent Hevy
 * workouts. Reads the same tables and Hevy client the Telegram bot uses.
 */
import { localDateKey, resolveTimezone } from "../nutrition/localDate.js";
import {
  fetchHevyWorkoutsPage,
  hevyApiKeyForUser,
  hevyApiKeyFromEnv,
  type HevyWorkout,
} from "../pillars/health/workouts/hevy/index.js";
import { supabase } from "../tools/clients.js";
import { getActivityRange, type DailyActivity } from "./activityStore.js";
import { getActiveGoal, getBodyCheckins } from "./bodyStore.js";
import { computeGoalProgress, type BodyCheckin, type GoalProgress } from "./goalProgress.js";
import { checkTime, DEFAULT_CHECK_DELAY_MIN } from "./gymSlot.js";
import { listMealsForDate } from "./meals.js";
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

const WINDOW_DAYS = 7;
const DAY_MS = 86_400_000;

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
    walkMinutes: number | null;
    isTrainingDay: boolean;
  };
  northStar: NorthStar;
  targets: HealthTargets;
  workouts: WorkoutSummary[];
  hevyConnected: boolean;
  /** Gym slot on training days and when the automatic Hevy check runs (local "HH:MM"). */
  gym: { time: string | null; checkDelayMin: number; checkAt: string | null };
  /** Post-gym-slot checks in the 7-day window, newest first. */
  workoutChecks: WorkoutCheck[];
  goal: GoalProgress | null;
  /** Body check-ins for the last ~6 months, oldest first, for the trend chart. */
  checkins: BodyCheckin[];
  meals: Array<{
    mealSessionId: string;
    slot: string;
    text: string;
    calories: number;
    proteinG: number;
    loggedAt: string;
  }>;
};

const CHECKIN_HISTORY_DAYS = 180;

/** Local dates oldest → newest, ending today. */
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
}> {
  const [profile, health] = await Promise.all([
    supabase.from("user_profile").select("timezone").eq("id", userProfileId).maybeSingle(),
    supabase
      .from("user_health_profile")
      .select(
        "daily_calorie_target, daily_protein_g_target, daily_step_target, training_days, gym_time, workout_check_delay_min",
      )
      .eq("user_profile_id", userProfileId)
      .maybeSingle(),
  ]);
  const h = (health.data ?? {}) as Record<string, unknown>;
  const num = (v: unknown): number | null => {
    const n = typeof v === "number" ? v : Number(v);
    return v === null || v === undefined || !Number.isFinite(n) || n <= 0 ? null : n;
  };
  const trainingDays = Array.isArray(h.training_days)
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
    },
    gym: {
      time: typeof h.gym_time === "string" && /^\d{2}:\d{2}/.test(h.gym_time) ? h.gym_time.slice(0, 5) : null,
      checkDelayMin: num(h.workout_check_delay_min) ?? DEFAULT_CHECK_DELAY_MIN,
    },
  };
}

type MealDay = { sessions: Set<string>; calories: number; proteinG: number };

async function loadMealDays(
  userProfileId: string,
  fromDate: string,
  toDate: string,
): Promise<Map<string, MealDay>> {
  const { data, error } = await supabase
    .from("meal_logs")
    .select("local_date, meal_session_id, calories, protein_g")
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
    const day = out.get(key) ?? { sessions: new Set<string>(), calories: 0, proteinG: 0 };
    if (r.meal_session_id) {
      day.sessions.add(String(r.meal_session_id));
    }
    day.calories += Number(r.calories) || 0;
    day.proteinG += Number(r.protein_g) || 0;
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
  const apiKey = (await hevyApiKeyForUser(userProfileId)) ?? hevyApiKeyFromEnv();
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

export async function buildHealthSnapshot(
  userProfileId: string,
  now = new Date(),
): Promise<HealthSnapshot> {
  const { timezone, targets, gym } = await loadHealthProfile(userProfileId);
  const dates = windowDates(now, timezone);
  const from = dates[0]!;
  const to = dates[dates.length - 1]!;

  const historyFrom = localDateKey(new Date(now.getTime() - CHECKIN_HISTORY_DAYS * DAY_MS), timezone);
  const [meals, activity, hevy, goal, checkins, todayMealList, workoutChecks] = await Promise.all([
    loadMealDays(userProfileId, from, to),
    getActivityRange(userProfileId, from, to),
    loadRecentWorkouts(userProfileId, timezone),
    getActiveGoal(userProfileId),
    getBodyCheckins(userProfileId, historyFrom),
    listMealsForDate(userProfileId, to),
    getWorkoutChecks(userProfileId, from, to),
  ]);

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

  const days = dates.map((date) => {
    const m = meals.get(date);
    const a: DailyActivity | undefined = activity.get(date);
    return scoreDay(
      {
        date,
        weekday: weekdayOfDate(date),
        mealSessions: m?.sessions.size ?? 0,
        calories: m?.calories ?? 0,
        proteinG: m?.proteinG ?? 0,
        steps: a?.steps ?? 0,
        workoutsLogged: workoutsByDate.get(date) ?? 0,
      },
      targets,
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
      walkMinutes: todayActivity?.walkMinutes ?? null,
      isTrainingDay: targets.trainingDays.includes(weekdayOfDate(to)),
    },
    northStar: computeNorthStar(days),
    targets,
    workouts: hevy.workouts,
    hevyConnected: hevy.connected,
    gym: { ...gym, checkAt: checkTime(gym) },
    workoutChecks: [...workoutChecks.values()].sort((a, b) => b.localDate.localeCompare(a.localDate)),
    goal: goal ? computeGoalProgress(goal, checkins, to) : null,
    checkins,
    meals: todayMealList.map((m) => ({
      mealSessionId: m.mealSessionId,
      slot: m.mealSlot,
      text: m.rawText,
      calories: Math.round(m.calories),
      proteinG: Math.round(m.protein_g),
      loggedAt: m.loggedAt,
    })),
  };
}
