/**
 * Supabase access for `magnus_events` — the master log of what was planned and what happened.
 *
 * Two rules live here rather than in the caller, because getting either wrong corrupts the history
 * the log exists to keep:
 *
 * 1. Moving a commitment always goes through the `magnus_reschedule_event` function, which closes
 *    the old row and opens its replacement in one transaction.
 * 2. A row that has already been superseded is history and is not edited again.
 *
 * @see supabase/migrations/20260731120000_magnus_events.sql
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "../logger.js";
import { loggableError } from "../util/loggableError.js";
import { supabase as defaultClient } from "../tools/clients.js";
import {
  EVENT_COLUMNS,
  SUPERSEDED_STATUSES,
  activityKeyFor,
  normalizePillar,
  type EventPillar,
  type EventRow,
  type EventStatus,
  type RescheduleKind,
} from "./eventTypes.js";

export type StoreResult<T> = { ok: true; data: T } | { ok: false; error: string };

export type EventStoreDeps = { client?: SupabaseClient };

const TABLE = "magnus_events";
const LIST_LIMIT_MAX = 100;
/** Two commitments to the same activity minutes apart are one commitment, entered twice. */
const DEDUPE_WINDOW_MINUTES = 15;

function client(deps?: EventStoreDeps): SupabaseClient {
  return deps?.client ?? defaultClient;
}

function fail(context: string, error: unknown): { ok: false; error: string } {
  const message =
    (error as { message?: string } | null)?.message ?? (error instanceof Error ? error.message : String(error));
  logger.warn({ err: loggableError(error), context }, "magnus_events query failed");
  return { ok: false, error: message };
}

export type CreateEventInput = {
  userProfileId: string;
  title: string;
  details?: string | null;
  pillar?: string | null;
  activity?: string | null;
  tags?: string[] | null;
  priority?: number | null;
  timeZone: string;
  plannedStartAt?: Date | null;
  plannedEndAt?: Date | null;
  plannedMinutes?: number | null;
  allDay?: boolean;
  status?: EventStatus;
  startedAt?: Date | null;
  endedAt?: Date | null;
  outcomeNote?: string | null;
  reason?: string | null;
  remindAt?: Date | null;
  googleEventId?: string | null;
  dailyLogId?: string | null;
  source?: string;
  createdBy?: string;
  idempotencyKey?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type CreateEventResult = {
  event: EventRow;
  /** Set when an equivalent commitment was already open, and this call returned it untouched. */
  duplicate: boolean;
};

/**
 * Inserts a commitment. A second identical commitment inside the dedupe window returns the
 * existing row instead of a twin, because "lock in the AI session at 9" said twice is one session.
 */
export async function createEvent(
  input: CreateEventInput,
  deps?: EventStoreDeps,
): Promise<StoreResult<CreateEventResult>> {
  const title = input.title.trim();
  if (!title) {
    return { ok: false, error: "an event needs a title" };
  }

  const pillar: EventPillar = normalizePillar(input.pillar);
  const activityKey = activityKeyFor({ activity: input.activity, title });

  if (input.plannedStartAt && activityKey) {
    const existing = await findDuplicate(
      {
        userProfileId: input.userProfileId,
        activityKey,
        plannedStartAt: input.plannedStartAt,
      },
      deps,
    );
    if (existing.ok && existing.data) {
      return { ok: true, data: { event: existing.data, duplicate: true } };
    }
  }

  const row = {
    user_profile_id: input.userProfileId,
    title,
    details: input.details?.trim() || null,
    pillar,
    activity_key: activityKey,
    tags: input.tags?.filter((t) => t.trim()).map((t) => t.trim().toLowerCase()) ?? [],
    priority: input.priority ?? null,
    time_zone: input.timeZone,
    planned_start_at: input.plannedStartAt?.toISOString() ?? null,
    planned_end_at: input.plannedEndAt?.toISOString() ?? null,
    planned_minutes: input.plannedMinutes ?? null,
    all_day: input.allDay ?? false,
    status: input.status ?? "planned",
    started_at: input.startedAt?.toISOString() ?? null,
    ended_at: input.endedAt?.toISOString() ?? null,
    outcome_note: input.outcomeNote?.trim() || null,
    reason: input.reason?.trim() || null,
    remind_at: input.remindAt?.toISOString() ?? null,
    google_event_id: input.googleEventId?.trim() || null,
    daily_log_id: input.dailyLogId ?? null,
    source: input.source ?? "telegram",
    created_by: input.createdBy ?? "user",
    idempotency_key: input.idempotencyKey?.trim() || null,
    metadata: input.metadata ?? {},
  };

  const { data, error } = await client(deps)
    .from(TABLE)
    .insert(row)
    .select(EVENT_COLUMNS)
    .single();

  if (error) {
    return fail("createEvent", error);
  }
  return { ok: true, data: { event: data as unknown as EventRow, duplicate: false } };
}

async function findDuplicate(
  input: { userProfileId: string; activityKey: string; plannedStartAt: Date },
  deps?: EventStoreDeps,
): Promise<StoreResult<EventRow | null>> {
  const windowMs = DEDUPE_WINDOW_MINUTES * 60 * 1000;
  const { data, error } = await client(deps)
    .from(TABLE)
    .select(EVENT_COLUMNS)
    .eq("user_profile_id", input.userProfileId)
    .eq("activity_key", input.activityKey)
    .in("status", ["planned", "in_progress"])
    .gte("planned_start_at", new Date(input.plannedStartAt.getTime() - windowMs).toISOString())
    .lte("planned_start_at", new Date(input.plannedStartAt.getTime() + windowMs).toISOString())
    .limit(1);

  if (error) {
    // A dedupe read that fails must not block the write it was protecting.
    logger.debug({ err: loggableError(error) }, "magnus_events dedupe lookup skipped");
    return { ok: true, data: null };
  }
  const rows = (data ?? []) as unknown as EventRow[];
  return { ok: true, data: rows[0] ?? null };
}

export type ListEventsInput = {
  userProfileId: string;
  from?: Date | null;
  to?: Date | null;
  statuses?: EventStatus[];
  pillar?: EventPillar | null;
  activityKey?: string | null;
  titleQuery?: string | null;
  /** Also return commitments with no time on them yet (the "someday" pile). */
  includeUnscheduled?: boolean;
  limit?: number;
};

export async function listEvents(
  input: ListEventsInput,
  deps?: EventStoreDeps,
): Promise<StoreResult<EventRow[]>> {
  const limit = Math.min(Math.max(input.limit ?? 30, 1), LIST_LIMIT_MAX);

  let query = client(deps)
    .from(TABLE)
    .select(EVENT_COLUMNS)
    .eq("user_profile_id", input.userProfileId)
    .order("planned_start_at", { ascending: true, nullsFirst: false })
    .limit(limit);

  if (input.from) {
    query = query.gte("planned_start_at", input.from.toISOString());
  }
  if (input.to) {
    query = query.lte("planned_start_at", input.to.toISOString());
  }
  if (input.statuses && input.statuses.length > 0) {
    query = query.in("status", input.statuses);
  }
  if (input.pillar) {
    query = query.eq("pillar", input.pillar);
  }
  if (input.activityKey) {
    query = query.eq("activity_key", input.activityKey);
  }
  if (input.titleQuery?.trim()) {
    query = query.ilike("title", `%${input.titleQuery.trim()}%`);
  }

  const { data, error } = await query;
  if (error) {
    return fail("listEvents", error);
  }
  const rows = (data ?? []) as unknown as EventRow[];

  if (!input.includeUnscheduled) {
    return { ok: true, data: rows };
  }

  const unscheduled = await listUnscheduled(input, limit, deps);
  if (!unscheduled.ok) {
    return { ok: true, data: rows };
  }
  return { ok: true, data: [...rows, ...unscheduled.data].slice(0, limit) };
}

async function listUnscheduled(
  input: ListEventsInput,
  limit: number,
  deps?: EventStoreDeps,
): Promise<StoreResult<EventRow[]>> {
  let query = client(deps)
    .from(TABLE)
    .select(EVENT_COLUMNS)
    .eq("user_profile_id", input.userProfileId)
    .is("planned_start_at", null)
    .in("status", input.statuses && input.statuses.length > 0 ? input.statuses : ["planned"])
    .order("created_at", { ascending: false })
    .limit(limit);

  if (input.pillar) {
    query = query.eq("pillar", input.pillar);
  }
  if (input.activityKey) {
    query = query.eq("activity_key", input.activityKey);
  }

  const { data, error } = await query;
  if (error) {
    return fail("listUnscheduled", error);
  }
  return { ok: true, data: (data ?? []) as unknown as EventRow[] };
}

export async function getEvent(
  input: { userProfileId: string; eventId: string },
  deps?: EventStoreDeps,
): Promise<StoreResult<EventRow | null>> {
  const { data, error } = await client(deps)
    .from(TABLE)
    .select(EVENT_COLUMNS)
    .eq("user_profile_id", input.userProfileId)
    .eq("id", input.eventId)
    .maybeSingle();

  if (error) {
    return fail("getEvent", error);
  }
  return { ok: true, data: (data as unknown as EventRow) ?? null };
}

/** Every row of one commitment's history, oldest first. */
export async function getEventChain(
  input: { userProfileId: string; rootEventId: string },
  deps?: EventStoreDeps,
): Promise<StoreResult<EventRow[]>> {
  const { data, error } = await client(deps)
    .from(TABLE)
    .select(EVENT_COLUMNS)
    .eq("user_profile_id", input.userProfileId)
    .eq("root_event_id", input.rootEventId)
    .order("reschedule_count", { ascending: true })
    .limit(50);

  if (error) {
    return fail("getEventChain", error);
  }
  return { ok: true, data: (data ?? []) as unknown as EventRow[] };
}

export type UpdateEventInput = {
  userProfileId: string;
  eventId: string;
  status?: EventStatus;
  reason?: string | null;
  outcomeNote?: string | null;
  details?: string | null;
  title?: string | null;
  priority?: number | null;
  startedAt?: Date | null;
  endedAt?: Date | null;
  remindAt?: Date | null;
  dailyLogId?: string | null;
  googleEventId?: string | null;
};

/**
 * Records what became of a commitment. Times moving is not an update — see `rescheduleEvent` — and
 * a row that has already been superseded is left alone so the trail stays truthful.
 */
export async function updateEvent(
  input: UpdateEventInput,
  deps?: EventStoreDeps,
): Promise<StoreResult<EventRow>> {
  if (input.status && SUPERSEDED_STATUSES.includes(input.status)) {
    return {
      ok: false,
      error: `use reschedule to mark something ${input.status}, so the replacement is recorded too`,
    };
  }

  const current = await getEvent(
    { userProfileId: input.userProfileId, eventId: input.eventId },
    deps,
  );
  if (!current.ok) {
    return current;
  }
  if (!current.data) {
    return { ok: false, error: "no event with that id" };
  }
  if (current.data.rescheduled_to) {
    return {
      ok: false,
      error: `that entry was already moved; its replacement is ${current.data.rescheduled_to}`,
    };
  }

  const patch: Record<string, unknown> = {};
  if (input.status) {
    patch.status = input.status;
  }
  if (input.reason !== undefined) {
    patch.reason = input.reason?.trim() || null;
  }
  if (input.outcomeNote !== undefined) {
    patch.outcome_note = input.outcomeNote?.trim() || null;
  }
  if (input.details !== undefined) {
    patch.details = input.details?.trim() || null;
  }
  if (input.title !== undefined && input.title?.trim()) {
    patch.title = input.title.trim();
  }
  if (input.priority !== undefined) {
    patch.priority = input.priority;
  }
  if (input.startedAt !== undefined) {
    patch.started_at = input.startedAt?.toISOString() ?? null;
  }
  if (input.endedAt !== undefined) {
    patch.ended_at = input.endedAt?.toISOString() ?? null;
  }
  if (input.remindAt !== undefined) {
    patch.remind_at = input.remindAt?.toISOString() ?? null;
  }
  if (input.dailyLogId !== undefined) {
    patch.daily_log_id = input.dailyLogId;
  }
  if (input.googleEventId !== undefined) {
    patch.google_event_id = input.googleEventId?.trim() || null;
  }

  if (Object.keys(patch).length === 0) {
    return { ok: true, data: current.data };
  }

  // "It is done" with no times given still tells us when: now.
  if (
    input.status === "done" &&
    input.endedAt === undefined &&
    !current.data.ended_at &&
    !current.data.completed_at
  ) {
    patch.ended_at = new Date().toISOString();
    if (!current.data.started_at && input.startedAt === undefined && current.data.planned_start_at) {
      patch.started_at = current.data.planned_start_at;
    }
  }

  const { data, error } = await client(deps)
    .from(TABLE)
    .update(patch)
    .eq("user_profile_id", input.userProfileId)
    .eq("id", input.eventId)
    .select(EVENT_COLUMNS)
    .single();

  if (error) {
    return fail("updateEvent", error);
  }
  return { ok: true, data: data as unknown as EventRow };
}

export type RescheduleEventInput = {
  userProfileId: string;
  eventId: string;
  /** Omit when the new time is genuinely unknown: the replacement is then unscheduled. */
  newStartAt?: Date | null;
  newEndAt?: Date | null;
  kind?: RescheduleKind | null;
  reason?: string | null;
  details?: string | null;
  timeZone?: string | null;
};

/**
 * Moves a commitment: closes the old row as postponed / preponed / rescheduled and returns its
 * replacement. Direction is inferred from the times when the caller does not name it.
 */
export async function rescheduleEvent(
  input: RescheduleEventInput,
  deps?: EventStoreDeps,
): Promise<StoreResult<{ previous: EventRow; next: EventRow }>> {
  const previous = await getEvent(
    { userProfileId: input.userProfileId, eventId: input.eventId },
    deps,
  );
  if (!previous.ok) {
    return previous;
  }
  if (!previous.data) {
    return { ok: false, error: "no event with that id" };
  }

  const { data, error } = await client(deps).rpc("magnus_reschedule_event", {
    p_event_id: input.eventId,
    p_new_start: input.newStartAt?.toISOString() ?? null,
    p_new_end: input.newEndAt?.toISOString() ?? null,
    p_kind: input.kind ?? null,
    p_reason: input.reason?.trim() || null,
    p_details: input.details?.trim() || null,
    p_time_zone: input.timeZone?.trim() || null,
    p_source: null,
  });

  if (error) {
    return fail("rescheduleEvent", error);
  }
  const next = (Array.isArray(data) ? data[0] : data) as EventRow | null;
  if (!next) {
    return { ok: false, error: "the move did not return a replacement" };
  }
  return { ok: true, data: { previous: previous.data, next } };
}

/**
 * Writes off commitments that are well past their time and were never touched. Returns how many.
 */
export async function sweepMissedEvents(
  input: { userProfileId: string; graceMinutes?: number; maxAgeDays?: number },
  deps?: EventStoreDeps,
): Promise<StoreResult<number>> {
  const { data, error } = await client(deps).rpc("magnus_sweep_missed_events", {
    p_user_profile_id: input.userProfileId,
    p_grace_minutes: input.graceMinutes ?? 180,
    p_max_age_days: input.maxAgeDays ?? 14,
  });

  if (error) {
    return fail("sweepMissedEvents", error);
  }
  return { ok: true, data: typeof data === "number" ? data : 0 };
}

export type ActivityStatsRow = {
  pillar: EventPillar;
  activity: string;
  total: number;
  done_count: number;
  partial_count: number;
  missed_count: number;
  skipped_count: number;
  cancelled_count: number;
  moved_count: number;
  postponed_count: number;
  preponed_count: number;
  avg_planned_minute_of_day: number | null;
  avg_start_delay_minutes: number | null;
  avg_actual_minutes: number | null;
  last_completed_at: string | null;
  last_planned_at: string | null;
};

/** Per-activity rhythm and adherence, busiest first. */
export async function activityStats(
  input: { userProfileId: string; activityKey?: string | null; limit?: number },
  deps?: EventStoreDeps,
): Promise<StoreResult<ActivityStatsRow[]>> {
  let query = client(deps)
    .from("magnus_event_activity_stats")
    .select("*")
    .eq("user_profile_id", input.userProfileId)
    .order("total", { ascending: false })
    .limit(Math.min(Math.max(input.limit ?? 8, 1), 40));

  if (input.activityKey) {
    query = query.eq("activity", input.activityKey);
  }

  const { data, error } = await query;
  if (error) {
    return fail("activityStats", error);
  }
  return { ok: true, data: (data ?? []) as unknown as ActivityStatsRow[] };
}
