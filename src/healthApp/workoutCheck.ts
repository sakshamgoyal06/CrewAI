/**
 * Gym slot follow-up: a set time after the gym slot on a training day, check Hevy for a workout
 * that day. If none is there, the coach asks in chat whether they trained, and the answer
 * (skipped + why, or trained but didn't log) is stored for root-cause analysis.
 */
import { z } from "zod";

import { localDateKey } from "../nutrition/localDate.js";
import type { ActionContext } from "./actions.js";
import { trainingActivity } from "./activities.js";
import { FALLBACK_WEIGHT_KG, getActivities, latestWeightKg, loadTrainingContext } from "./activityLog.js";
import { formatTime, zonedInstant, type GymSlot } from "./gymSlot.js";
import { isGym, UNTIMED_CHECK_AT, type RoutineItem } from "./routine.js";
import { loadHealthProfile, loadRecentWorkouts, weekdayOfDate, type WorkoutSummary } from "./snapshot.js";
import { analyzeTraining, hevyKey, loadWorkoutHistory, workoutReview } from "./training.js";
import {
  getWorkoutChecks,
  insertWorkoutCheck,
  postCoachMessage,
  saveWorkoutCheckAnswer,
  type WorkoutCheckStatus,
} from "./workoutCheckStore.js";

const DAY_MS = 86_400_000;
/** A check that comes due while the server is down still runs if it's at most this late. */
const MAX_LATE_MS = 12 * 3_600_000;
export const SCHEDULER_INTERVAL_MS = 5 * 60_000;

export const workoutCheckAnswerInput = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  answer: z.enum(["recheck", "skipped", "trained_unlogged"]),
  reason: z.string().trim().max(300).optional(),
});

export type WorkoutCheckCard = {
  type: "workout_check";
  date: string;
  gymTime: string;
  status: WorkoutCheckStatus;
  reason?: string | null;
};

/**
 * Training days (today, or yesterday when the slot runs late) whose check time has passed and is
 * at most MAX_LATE_MS ago.
 */
export function dueWorkoutChecks(input: {
  now: Date;
  timezone: string;
  trainingDays: number[];
  slot: GymSlot;
}): Array<{ date: string; dueAt: Date }> {
  const { now, timezone, trainingDays, slot } = input;
  if (!slot.time) return [];
  const dates = [...new Set([localDateKey(new Date(now.getTime() - DAY_MS), timezone), localDateKey(now, timezone)])];
  const out: Array<{ date: string; dueAt: Date }> = [];
  for (const date of dates) {
    if (!trainingDays.includes(weekdayOfDate(date))) continue;
    const dueAt = new Date(zonedInstant(date, slot.time, timezone).getTime() + slot.checkDelayMin * 60_000);
    const late = now.getTime() - dueAt.getTime();
    if (late >= 0 && late <= MAX_LATE_MS) out.push({ date, dueAt });
  }
  return out;
}

/**
 * The gym slots to check: each gym item on the routine (its days, time and delay), or the legacy
 * single gym slot on training days when there's no routine. A gym item with no time is checked
 * in the evening.
 */
export function gymPlans(profile: {
  targets: { trainingDays: number[] };
  gym: GymSlot;
  routine?: RoutineItem[] | null;
}): Array<{ trainingDays: number[]; slot: GymSlot }> {
  if (!profile.routine?.length) return [{ trainingDays: profile.targets.trainingDays, slot: profile.gym }];
  return profile.routine.filter(isGym).map((i) => ({
    trainingDays: i.days,
    slot: i.startTime ? { time: i.startTime, checkDelayMin: i.checkAfterMin } : { time: UNTIMED_CHECK_AT, checkDelayMin: 0 },
  }));
}

export function workoutOn(workouts: WorkoutSummary[], date: string): WorkoutSummary | null {
  return workouts.find((w) => w.localDate === date) ?? null;
}

export function missedWorkoutMessage(date: string, today: string, slot: GymSlot): string {
  if (slot.checkDelayMin === 0) return `There's no workout in Hevy for ${date === today ? "today" : "yesterday"}. Did you train?`;
  const when = date === today ? "Your" : "Yesterday's";
  const hours = Math.round((slot.checkDelayMin / 60) * 10) / 10;
  return `${when} ${formatTime(slot.time!)} gym slot was ${hours} hours ago and there's no workout in Hevy. Did you train?`;
}

type Deps = {
  loadProfile: typeof loadHealthProfile;
  recentWorkouts: typeof loadRecentWorkouts;
  getChecks: typeof getWorkoutChecks;
  insertCheck: typeof insertWorkoutCheck;
  postMessage: typeof postCoachMessage;
  /** Post-workout note (new bests, stalled lifts) for a workout the check found, or null. */
  review: (userProfileId: string, timezone: string, now: Date, workout: WorkoutSummary) => Promise<string | null>;
  /** A sport logged that day that stands in for the workout ("Football · 60 min"), or null. */
  sportOn?: (userProfileId: string, timezone: string, date: string) => Promise<string | null>;
};

async function sportFromActivities(userProfileId: string, timezone: string, date: string): Promise<string | null> {
  const acts = await getActivities(userProfileId, date, date);
  if (!acts.length) return null;
  const kg = (await latestWeightKg(userProfileId)) ?? FALLBACK_WEIGHT_KG;
  const ctx = await loadTrainingContext(userProfileId, timezone, date, kg);
  const a = trainingActivity(acts, ctx.workouts, ctx.typicalBurn);
  return a ? `${a.label} · ${a.durationMin} min` : null;
}

async function reviewFromHevy(
  userProfileId: string,
  timezone: string,
  now: Date,
  workout: WorkoutSummary,
): Promise<string | null> {
  const apiKey = await hevyKey(userProfileId);
  if (!apiKey) return null;
  const history = await loadWorkoutHistory(apiKey, now, 8);
  if (!history.ok) return null;
  return workoutReview(workout, workout.localDate, analyzeTraining(history.workouts, now, timezone, 8));
}

const defaultDeps: Deps = {
  loadProfile: (id) => loadHealthProfile(id),
  recentWorkouts: (id, tz) => loadRecentWorkouts(id, tz),
  getChecks: (id, from, to) => getWorkoutChecks(id, from, to),
  insertCheck: (id, check) => insertWorkoutCheck(id, check),
  postMessage: (id, content, cards) => postCoachMessage(id, content, cards),
  review: reviewFromHevy,
  sportOn: sportFromActivities,
};

/** Runs any due checks once. Safe to call repeatedly: each day is checked at most once. */
export async function runWorkoutChecks(
  userProfileId: string,
  now = new Date(),
  deps: Deps = defaultDeps,
): Promise<Array<{ date: string; status: WorkoutCheckStatus }>> {
  const profile = await deps.loadProfile(userProfileId);
  const { timezone } = profile;
  // One check per day: with two gym items on a day, the first one due wins.
  const byDate = new Map<string, { date: string; dueAt: Date; slot: GymSlot }>();
  for (const plan of gymPlans(profile)) {
    for (const d of dueWorkoutChecks({ now, timezone, trainingDays: plan.trainingDays, slot: plan.slot })) {
      if (!byDate.has(d.date)) byDate.set(d.date, { ...d, slot: plan.slot });
    }
  }
  const due = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  if (!due.length) return [];

  const existing = await deps.getChecks(userProfileId, due[0]!.date, due[due.length - 1]!.date);
  const pending = due.filter((d) => !existing.has(d.date));
  if (!pending.length) return [];

  const hevy = await deps.recentWorkouts(userProfileId, timezone);
  // Without a successful Hevy read, "no workout" would be a guess, so wait for the next run.
  if (!hevy.connected || !hevy.fetched) return [];

  const today = localDateKey(now, timezone);
  const results: Array<{ date: string; status: WorkoutCheckStatus }> = [];
  for (const { date, slot: gym } of pending) {
    const workout = workoutOn(hevy.workouts, date);
    // A sport that burned like a gym session already covers the day; no need to ask.
    const sport = workout ? null : await deps.sportOn?.(userProfileId, timezone, date).catch(() => null) ?? null;
    const status: WorkoutCheckStatus = workout || sport ? "found" : "missing";
    const inserted = await deps.insertCheck(userProfileId, {
      localDate: date,
      gymTime: gym.time!,
      status,
      hevyWorkoutId: workout?.id ?? null,
      reason: sport,
    });
    if (!inserted) continue;
    results.push({ date, status });
    if (status === "missing") {
      const card: WorkoutCheckCard = { type: "workout_check", date, gymTime: gym.time!, status };
      await deps.postMessage(userProfileId, missedWorkoutMessage(date, today, gym), [card]);
    } else if (workout) {
      const note = await deps.review(userProfileId, timezone, now, workout).catch(() => null);
      if (note) await deps.postMessage(userProfileId, note, []);
    }
  }
  return results;
}

/** The person's reply to a check: look at Hevy again, or record a skip (with why) or an unlogged session. */
export async function answerWorkoutCheck(
  ctx: ActionContext,
  input: z.infer<typeof workoutCheckAnswerInput>,
  deps: Pick<Deps, "loadProfile" | "recentWorkouts"> & { save: typeof saveWorkoutCheckAnswer } = {
    ...defaultDeps,
    save: (id, check) => saveWorkoutCheckAnswer(id, check),
  },
): Promise<{ ok: boolean; status?: WorkoutCheckStatus; error?: string }> {
  const now = ctx.now ?? new Date();
  const date = input.date ?? localDateKey(now, ctx.timezone);
  if (date > localDateKey(now, ctx.timezone)) return { ok: false, error: "future_date" };
  const { gym } = await deps.loadProfile(ctx.userProfileId);
  const gymTime = gym.time ?? "00:00";

  if (input.answer === "recheck") {
    const hevy = await deps.recentWorkouts(ctx.userProfileId, ctx.timezone);
    if (!hevy.connected) return { ok: false, error: "hevy_not_connected" };
    if (!hevy.fetched) return { ok: false, error: "hevy_unavailable" };
    const workout = workoutOn(hevy.workouts, date);
    if (!workout) return { ok: true, status: "missing" };
    const saved = await deps.save(ctx.userProfileId, {
      localDate: date,
      gymTime,
      status: "found",
      hevyWorkoutId: workout.id,
      reason: null,
    });
    return saved.ok ? { ok: true, status: "found" } : saved;
  }

  const saved = await deps.save(ctx.userProfileId, {
    localDate: date,
    gymTime,
    status: input.answer,
    hevyWorkoutId: null,
    reason: input.answer === "skipped" ? input.reason?.trim() || null : null,
  });
  return saved.ok ? { ok: true, status: input.answer } : saved;
}
