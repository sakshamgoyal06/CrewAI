import { localDateKey } from "./eventTime.js";
import type { HevyWorkout } from "../pillars/health/workouts/hevy/types.js";

/** Grace after planned start before we check Hevy / nudge the user. */
export const GYM_HEVY_RECONCILE_GRACE_HOURS = 3;

const GYM_ACTIVITY_KEYS = new Set(["gym", "gym_push_a", "gym_pull_a", "gym_legs"]);

/** Whether an event log row is a gym commitment we reconcile against Hevy. */
export function isGymEvent(row: { activity_key?: string | null; title?: string | null }): boolean {
  const key = row.activity_key?.trim().toLowerCase();
  if (key && (GYM_ACTIVITY_KEYS.has(key) || key.startsWith("gym"))) {
    return true;
  }
  return /\bgym\b/i.test(row.title ?? "");
}

/** Session label from titles like "Gym — Pull A". */
export function gymSessionLabelFromTitle(title: string): string | null {
  const trimmed = title.trim();
  const dash = trimmed.match(/\bgym\s*[—–-]\s*(.+)$/i);
  if (dash?.[1]) {
    return dash[1].trim();
  }
  return null;
}

/** Local calendar date for a Hevy workout start, in the user's zone. */
export function hevyWorkoutLocalDate(workout: HevyWorkout, timeZone: string): string | null {
  if (!workout.start_time?.trim()) {
    return null;
  }
  const at = new Date(workout.start_time);
  if (Number.isNaN(at.getTime())) {
    return null;
  }
  return localDateKey(at, timeZone);
}

/** Parse Hevy start/end into valid Date objects (end must be >= start). */
export function hevyWorkoutTimes(workout: HevyWorkout): { startedAt: Date; endedAt: Date } | null {
  if (!workout.start_time?.trim()) {
    return null;
  }
  const startedAt = new Date(workout.start_time);
  if (Number.isNaN(startedAt.getTime())) {
    return null;
  }
  let endedAt: Date;
  if (workout.end_time?.trim()) {
    endedAt = new Date(workout.end_time);
    if (Number.isNaN(endedAt.getTime()) || endedAt < startedAt) {
      endedAt = startedAt;
    }
  } else {
    endedAt = startedAt;
  }
  return { startedAt, endedAt };
}

/**
 * True when the Hevy workout title matches the planned session label (Push A, Pull A, …).
 * Generic gym events accept any workout on that day.
 */
export function hevyWorkoutMatchesEvent(workout: HevyWorkout, eventTitle: string): boolean {
  const label = gymSessionLabelFromTitle(eventTitle);
  const wTitle = workout.title?.trim() ?? "";
  if (!label) {
    return true;
  }
  if (!wTitle) {
    return true;
  }
  const a = label.toLowerCase();
  const b = wTitle.toLowerCase();
  return b.includes(a) || a.includes(b);
}

/**
 * Pick the best Hevy workout for a planned gym event on the same local day.
 * Prefers title match, then closest start time to planned start.
 */
export function pickHevyWorkoutForGymEvent(
  workouts: HevyWorkout[],
  input: { eventTitle: string; plannedStartAt: Date; timeZone: string },
): HevyWorkout | null {
  const plannedDate = localDateKey(input.plannedStartAt, input.timeZone);
  const sameDay = workouts.filter((w) => hevyWorkoutLocalDate(w, input.timeZone) === plannedDate);
  if (!sameDay.length) {
    return null;
  }

  const titled = sameDay.filter((w) => hevyWorkoutMatchesEvent(w, input.eventTitle));
  const pool = titled.length ? titled : sameDay;

  let best: HevyWorkout | null = null;
  let bestDelta = Number.POSITIVE_INFINITY;
  for (const w of pool) {
    if (!w.start_time) {
      continue;
    }
    const start = new Date(w.start_time);
    if (Number.isNaN(start.getTime())) {
      continue;
    }
    const delta = Math.abs(start.getTime() - input.plannedStartAt.getTime());
    if (delta < bestDelta) {
      bestDelta = delta;
      best = w;
    }
  }
  return best ?? pool[0] ?? null;
}

export type HevyReconcileMetadata = {
  at: string;
  result: "matched" | "no_session";
  hevy_workout_id?: string;
};

export function readHevyReconcileMetadata(
  metadata: unknown,
): HevyReconcileMetadata | null {
  if (!metadata || typeof metadata !== "object") {
    return null;
  }
  const block = (metadata as Record<string, unknown>).hevy_reconcile;
  if (!block || typeof block !== "object") {
    return null;
  }
  const r = block as Record<string, unknown>;
  const result = r.result;
  const at = r.at;
  if (result !== "matched" && result !== "no_session") {
    return null;
  }
  if (typeof at !== "string" || !at.trim()) {
    return null;
  }
  return {
    at: at.trim(),
    result,
    hevy_workout_id:
      typeof r.hevy_workout_id === "string" ? r.hevy_workout_id.trim() : undefined,
  };
}
