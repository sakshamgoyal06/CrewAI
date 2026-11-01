/**
 * After planned gym time + grace, check Hevy and sync the event log or nudge the user.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { formatInstant, formatMinutes } from "./eventTime.js";
import {
  GYM_HEVY_RECONCILE_GRACE_HOURS,
  hevyWorkoutTimes,
  isGymEvent,
  pickHevyWorkoutForGymEvent,
  readHevyReconcileMetadata,
  type HevyReconcileMetadata,
} from "./gymHevyMatch.js";
import { updateEvent } from "./eventStore.js";
import { logger } from "../logger.js";
import { fetchHevyWorkoutsPage } from "../pillars/health/workouts/hevy/hevyClient.js";
import type { HevyWorkout } from "../pillars/health/workouts/hevy/types.js";

export type GymEventCandidate = {
  id: string;
  user_profile_id: string;
  title: string;
  time_zone: string;
  planned_start_at: string;
  status: string;
  metadata: Record<string, unknown> | null;
  external_refs: Record<string, unknown> | null;
};

export type GymHevyReconcileOutcome =
  | { kind: "skipped"; reason: string }
  | { kind: "matched"; message: string; workoutId: string }
  | { kind: "no_session"; message: string };

const MAX_HEVY_PAGES = 5;
const HEVY_PAGE_SIZE = 10;

/** Fetch recent Hevy workouts (newest pages first). */
export async function fetchRecentHevyWorkouts(
  apiKey: string,
  options?: { fetchImpl?: typeof fetch },
): Promise<HevyWorkout[]> {
  const all: HevyWorkout[] = [];
  for (let page = 1; page <= MAX_HEVY_PAGES; page++) {
    const res = await fetchHevyWorkoutsPage(apiKey, page, HEVY_PAGE_SIZE, options);
    if (!res.ok) {
      logger.warn({ err: res.error, status: res.status }, "gym hevy reconcile: workouts fetch failed");
      break;
    }
    const batch = res.data.workouts ?? [];
    if (!batch.length) {
      break;
    }
    all.push(...batch);
    if ((res.data.page_count ?? 1) <= page) {
      break;
    }
  }
  return all;
}

function reconcileMetaPatch(
  existing: Record<string, unknown> | null,
  patch: HevyReconcileMetadata,
): Record<string, unknown> {
  return { ...(existing ?? {}), hevy_reconcile: patch };
}

/** Planned slot with calendar date so "Pull A" nudges are not ambiguous. */
export function formatPlannedGymLabel(input: {
  title: string;
  plannedStartAt: Date;
  timeZone: string;
}): string {
  const when = formatInstant(input.plannedStartAt, input.timeZone);
  return `${when} — ${input.title.trim()}`;
}

export function buildMatchedMessage(input: {
  eventTitle: string;
  plannedStartAt: Date;
  workout: HevyWorkout;
  timeZone: string;
}): string {
  const times = hevyWorkoutTimes(input.workout);
  const planLabel = formatPlannedGymLabel({
    title: input.eventTitle,
    plannedStartAt: input.plannedStartAt,
    timeZone: input.timeZone,
  });
  const name = input.workout.title?.trim() || input.eventTitle;
  if (!times) {
    return `Logged **${planLabel}** from Hevy (**${name}**). The event log is updated.`;
  }
  const when = formatInstant(times.startedAt, input.timeZone);
  const duration = formatMinutes(
    Math.round((times.endedAt.getTime() - times.startedAt.getTime()) / 60_000),
  );
  return (
    `Found **${planLabel}** in Hevy and logged it: **${name}** — ${when} (${duration}).\n\n` +
    `The morning brief will count this as done.`
  );
}

export function buildMissedGymMessage(input: {
  title: string;
  plannedStartAt: Date;
  timeZone: string;
}): string {
  const planLabel = formatPlannedGymLabel(input);
  return (
    `**${planLabel}** was on the plan, but I don't see a Hevy session for that day yet.\n\n` +
    `Did you miss it, or log elsewhere? Reply to mark it done, skip it, or say when to postpone.`
  );
}

/**
 * Reconcile one gym event against Hevy. Idempotent when metadata.hevy_reconcile is already set.
 */
export async function reconcileGymEventWithHevy(
  event: GymEventCandidate,
  workouts: HevyWorkout[],
  now: Date,
  deps?: { client?: SupabaseClient },
): Promise<GymHevyReconcileOutcome> {
  if (!isGymEvent(event)) {
    return { kind: "skipped", reason: "not_gym" };
  }
  if (event.status === "done" || event.status === "skipped" || event.status === "cancelled") {
    return { kind: "skipped", reason: "already_closed" };
  }

  const prior = readHevyReconcileMetadata(event.metadata);
  if (prior) {
    return { kind: "skipped", reason: "already_reconciled" };
  }

  const plannedStart = new Date(event.planned_start_at);
  if (Number.isNaN(plannedStart.getTime())) {
    return { kind: "skipped", reason: "no_planned_start" };
  }

  const graceMs = GYM_HEVY_RECONCILE_GRACE_HOURS * 60 * 60 * 1000;
  if (now.getTime() < plannedStart.getTime() + graceMs) {
    return { kind: "skipped", reason: "before_grace_window" };
  }

  const workout = pickHevyWorkoutForGymEvent(workouts, {
    eventTitle: event.title,
    plannedStartAt: plannedStart,
    timeZone: event.time_zone || "UTC",
  });

  const client = deps?.client;
  const reconcileAt = now.toISOString();

  if (workout?.id) {
    const times = hevyWorkoutTimes(workout);
    if (!times) {
      return { kind: "skipped", reason: "hevy_times_invalid" };
    }

    const updated = await updateEvent(
      {
        userProfileId: event.user_profile_id,
        eventId: event.id,
        status: "done",
        startedAt: times.startedAt,
        endedAt: times.endedAt,
        outcomeNote: `Synced from Hevy (${workout.title?.trim() || "workout"}).`,
      },
      deps,
    );

    if (!updated.ok) {
      logger.warn(
        { err: updated.error, eventId: event.id },
        "gym hevy reconcile: update_event failed",
      );
      return { kind: "skipped", reason: "update_failed" };
    }

    if (client) {
      const meta: HevyReconcileMetadata = {
        at: reconcileAt,
        result: "matched",
        hevy_workout_id: workout.id,
      };
      const { error } = await client
        .from("magnus_events")
        .update({
          metadata: reconcileMetaPatch(event.metadata, meta),
          external_refs: {
            ...(event.external_refs ?? {}),
            hevy_workout_id: workout.id,
          },
        })
        .eq("id", event.id)
        .eq("user_profile_id", event.user_profile_id);
      if (error) {
        logger.warn({ err: error.message, eventId: event.id }, "gym hevy reconcile: metadata patch failed");
      }
    }

    return {
      kind: "matched",
      message: buildMatchedMessage({
        eventTitle: event.title,
        plannedStartAt: plannedStart,
        workout,
        timeZone: event.time_zone || "UTC",
      }),
      workoutId: workout.id,
    };
  }

  if (client) {
    const meta: HevyReconcileMetadata = {
      at: reconcileAt,
      result: "no_session",
    };
    const { error } = await client
      .from("magnus_events")
      .update({
        metadata: reconcileMetaPatch(event.metadata, meta),
      })
      .eq("id", event.id)
      .eq("user_profile_id", event.user_profile_id);
    if (error) {
      logger.warn({ err: error.message, eventId: event.id }, "gym hevy reconcile: no_session metadata failed");
    }
  }

  return {
    kind: "no_session",
    message: buildMissedGymMessage({
      title: event.title,
      plannedStartAt: plannedStart,
      timeZone: event.time_zone || "UTC",
    }),
  };
}

/** Events past the grace window that have not been Hevy-reconciled yet. */
export function isGymEventDueForHevyReconcile(
  event: GymEventCandidate,
  now: Date,
): boolean {
  if (!isGymEvent(event)) {
    return false;
  }
  if (["done", "skipped", "cancelled", "postponed", "preponed", "rescheduled"].includes(event.status)) {
    return false;
  }
  if (readHevyReconcileMetadata(event.metadata)) {
    return false;
  }
  const plannedStart = new Date(event.planned_start_at);
  if (Number.isNaN(plannedStart.getTime())) {
    return false;
  }
  const graceMs = GYM_HEVY_RECONCILE_GRACE_HOURS * 60 * 60 * 1000;
  return now.getTime() >= plannedStart.getTime() + graceMs;
}
