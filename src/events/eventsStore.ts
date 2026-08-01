/**
 * Reads and writes for `magnus_events`.
 *
 * Two rules the rest of the code depends on:
 *  - Every query is scoped to one `user_profile_id`, including the ones that go through an RPC.
 *  - Moving an event is never an UPDATE of the time. `rescheduleMagnusEvent` calls the database
 *    function, which closes the old row and opens a linked replacement in one transaction.
 *    Plain `updateMagnusEvent` is for corrections — a time typed wrong, a better title.
 *
 * Writes report failure instead of throwing, the same as `recordMagnusDailyLog`, because a lost
 * log line must never take a Telegram turn down with it.
 */
import { logger } from "../logger.js";
import { supabase } from "../tools/clients.js";
import { loggableError } from "../util/loggableError.js";
import {
  OPEN_EVENT_STATUSES,
  type ActivityStatsRow,
  type EventKind,
  type EventPillar,
  type EventPriority,
  type EventSource,
  type EventStatus,
  type EventWriteResult,
  type MagnusEventRow,
  type SettableEventStatus,
} from "./types.js";

const TABLE = "magnus_events";
const STATS_VIEW = "magnus_activity_stats";
const MAX_TITLE = 300;
const MAX_TEXT = 4000;
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 200;

export type RecordMagnusEventInput = {
  userProfileId: string;
  title: string;
  details?: string | null;
  pillar?: EventPillar;
  kind?: EventKind;
  activityKey?: string | null;
  tags?: string[];
  location?: string | null;
  priority?: EventPriority;
  timeZone: string;
  allDay?: boolean;
  plannedStartAt?: Date | null;
  plannedEndAt?: Date | null;
  plannedDurationMinutes?: number | null;
  status?: SettableEventStatus;
  startedAt?: Date | null;
  endedAt?: Date | null;
  outcomeNote?: string | null;
  qualityRating?: number | null;
  source?: EventSource;
  calendarEventId?: string | null;
  calendarId?: string | null;
  dailyLogId?: string | null;
  reminderAt?: Date | null;
  metadata?: Record<string, unknown> | null;
};

export type ListMagnusEventsInput = {
  userProfileId: string;
  /** Inclusive lower bound on `planned_start_at`. */
  from?: Date | null;
  /** Exclusive upper bound on `planned_start_at`. */
  to?: Date | null;
  statuses?: EventStatus[];
  /** Shorthand for the two open statuses. */
  openOnly?: boolean;
  pillar?: EventPillar;
  /** Case-insensitive match on the title. */
  query?: string;
  /** Only the live end of each reschedule chain. */
  latestOnly?: boolean;
  /** Include events with no planned time (backlog). Defaults to true when no range is given. */
  includeUnscheduled?: boolean;
  limit?: number;
  order?: "asc" | "desc";
};

const trimTo = (value: string | null | undefined, max: number): string | null => {
  const t = value?.trim();
  return t ? t.slice(0, max) : null;
};

const iso = (d: Date | null | undefined): string | null =>
  d && !Number.isNaN(d.getTime()) ? d.toISOString() : null;

/**
 * Turns a Postgres error into something worth showing a person. The constraint names carry the
 * intent, so the message can say what the rule was rather than quoting the database.
 */
export function describeEventError(error: { message?: string; code?: string } | null): string {
  const message = error?.message ?? "unknown error";
  if (message.includes("uq_magnus_events_open_duplicate")) {
    return "there is already an open event with that title at that time";
  }
  if (message.includes("uq_magnus_events_calendar_event")) {
    return "that calendar event is already tracked by an open entry";
  }
  if (message.includes("uq_magnus_events_chain_predecessor")) {
    return "that event has already been moved once";
  }
  if (message.includes("chk_magnus_events_planned_order")) {
    return "the end time is before the start time";
  }
  if (message.includes("chk_magnus_events_superseded_status")) {
    return "that event was already replaced by a later one";
  }
  if (message.includes("chk_magnus_events_")) {
    return `the value breaks a rule on the events table (${message})`;
  }
  if (error?.code === "42P01") {
    return "the magnus_events table is missing — apply supabase/migrations/20260801120000_magnus_events.sql";
  }
  if (error?.code === "PGRST202") {
    return "the reschedule function is missing — apply supabase/migrations/20260801120000_magnus_events.sql";
  }
  return message;
}

export async function recordMagnusEvent(
  input: RecordMagnusEventInput,
): Promise<EventWriteResult> {
  const title = trimTo(input.title, MAX_TITLE);
  if (!title) {
    return { ok: false, error: "an event needs a title" };
  }

  const row = {
    user_profile_id: input.userProfileId,
    title,
    details: trimTo(input.details, MAX_TEXT),
    pillar: input.pillar ?? "general",
    kind: input.kind ?? "event",
    activity_key: trimTo(input.activityKey, 60),
    tags: input.tags?.map((t) => t.trim().toLowerCase()).filter(Boolean) ?? [],
    location: trimTo(input.location, 300),
    priority: input.priority ?? "normal",
    time_zone: input.timeZone,
    all_day: input.allDay ?? false,
    planned_start_at: iso(input.plannedStartAt),
    planned_end_at: iso(input.plannedEndAt),
    planned_duration_minutes: input.plannedDurationMinutes ?? null,
    status: input.status ?? "planned",
    started_at: iso(input.startedAt),
    ended_at: iso(input.endedAt),
    outcome_note: trimTo(input.outcomeNote, MAX_TEXT),
    quality_rating: input.qualityRating ?? null,
    source: input.source ?? "telegram",
    calendar_event_id: trimTo(input.calendarEventId, 1024),
    calendar_id: trimTo(input.calendarId, 1024),
    daily_log_id: input.dailyLogId ?? null,
    reminder_at: iso(input.reminderAt),
    metadata: input.metadata ?? {},
  };

  const { data, error } = await supabase.from(TABLE).insert(row).select("*").single();

  if (error) {
    logger.warn(
      { err: loggableError(error), userProfileId: input.userProfileId },
      "magnus_events insert failed",
    );
    return { ok: false, error: describeEventError(error) };
  }
  return { ok: true, event: data as MagnusEventRow };
}

export async function listMagnusEvents(
  input: ListMagnusEventsInput,
): Promise<{ ok: true; events: MagnusEventRow[] } | { ok: false; error: string }> {
  const limit = Math.min(Math.max(input.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const ranged = Boolean(input.from || input.to);

  let q = supabase
    .from(TABLE)
    .select("*")
    .eq("user_profile_id", input.userProfileId)
    .is("deleted_at", null);

  if (input.openOnly) {
    q = q.in("status", [...OPEN_EVENT_STATUSES]);
  } else if (input.statuses?.length) {
    q = q.in("status", input.statuses);
  }
  if (input.pillar) {
    q = q.eq("pillar", input.pillar);
  }
  if (input.latestOnly) {
    q = q.is("rescheduled_to_event_id", null);
  }
  if (input.query?.trim()) {
    // Commas and parentheses would be read as PostgREST filter syntax.
    const safe = input.query.trim().replace(/[(),*]/g, " ").slice(0, 120);
    q = q.ilike("title", `%${safe}%`);
  }

  const from = iso(input.from);
  const to = iso(input.to);
  if (ranged) {
    const window: string[] = [];
    if (from) {
      window.push(`planned_start_at.gte.${from}`);
    }
    if (to) {
      window.push(`planned_start_at.lt.${to}`);
    }
    if (input.includeUnscheduled) {
      // Backlog items have no time at all, so they sit outside every window unless asked for.
      q = q.or(`and(${window.join(",")}),planned_start_at.is.null`);
    } else {
      if (from) {
        q = q.gte("planned_start_at", from);
      }
      if (to) {
        q = q.lt("planned_start_at", to);
      }
    }
  } else if (input.includeUnscheduled === false) {
    q = q.not("planned_start_at", "is", null);
  }

  const { data, error } = await q
    .order("planned_start_at", { ascending: input.order !== "desc", nullsFirst: false })
    .order("created_at", { ascending: input.order !== "desc" })
    .limit(limit);

  if (error) {
    logger.warn(
      { err: loggableError(error), userProfileId: input.userProfileId },
      "magnus_events list failed",
    );
    return { ok: false, error: describeEventError(error) };
  }
  return { ok: true, events: (data ?? []) as MagnusEventRow[] };
}

export async function getMagnusEvent(
  userProfileId: string,
  eventId: string,
): Promise<MagnusEventRow | null> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("user_profile_id", userProfileId)
    .eq("id", eventId)
    .maybeSingle();

  if (error) {
    logger.warn({ err: loggableError(error), eventId }, "magnus_events fetch failed");
    return null;
  }
  return (data as MagnusEventRow | null) ?? null;
}

/** Every row of one reschedule chain, oldest plan first. */
export async function getMagnusEventChain(
  userProfileId: string,
  rootEventId: string,
): Promise<MagnusEventRow[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("user_profile_id", userProfileId)
    .eq("root_event_id", rootEventId)
    .order("reschedule_count", { ascending: true });

  if (error) {
    logger.warn({ err: loggableError(error), rootEventId }, "magnus_events chain fetch failed");
    return [];
  }
  return (data ?? []) as MagnusEventRow[];
}

export type UpdateEventStatusInput = {
  userProfileId: string;
  eventId: string;
  status: SettableEventStatus;
  outcomeNote?: string | null;
  qualityRating?: number | null;
  startedAt?: Date | null;
  endedAt?: Date | null;
  dailyLogId?: string | null;
};

export async function updateMagnusEventStatus(
  input: UpdateEventStatusInput,
): Promise<EventWriteResult> {
  const patch: Record<string, unknown> = { status: input.status };
  if (input.outcomeNote !== undefined) {
    patch.outcome_note = trimTo(input.outcomeNote, MAX_TEXT);
  }
  if (input.qualityRating !== undefined) {
    patch.quality_rating = input.qualityRating;
  }
  if (input.startedAt !== undefined) {
    patch.started_at = iso(input.startedAt);
  }
  if (input.endedAt !== undefined) {
    patch.ended_at = iso(input.endedAt);
  }
  if (input.dailyLogId !== undefined) {
    patch.daily_log_id = input.dailyLogId;
  }

  const { data, error } = await supabase
    .from(TABLE)
    .update(patch)
    .eq("user_profile_id", input.userProfileId)
    .eq("id", input.eventId)
    .is("deleted_at", null)
    .select("*")
    .maybeSingle();

  if (error) {
    logger.warn(
      { err: loggableError(error), eventId: input.eventId },
      "magnus_events status update failed",
    );
    return { ok: false, error: describeEventError(error) };
  }
  if (!data) {
    return { ok: false, error: "no such event" };
  }
  return { ok: true, event: data as MagnusEventRow };
}

export type UpdateEventFieldsInput = {
  userProfileId: string;
  eventId: string;
  title?: string;
  details?: string | null;
  pillar?: EventPillar;
  priority?: EventPriority;
  location?: string | null;
  tags?: string[];
  /** A correction to a mistyped time — not a postponement. */
  plannedStartAt?: Date | null;
  plannedEndAt?: Date | null;
  reminderAt?: Date | null;
  calendarEventId?: string | null;
  dailyLogId?: string | null;
};

export async function updateMagnusEvent(
  input: UpdateEventFieldsInput,
): Promise<EventWriteResult> {
  const patch: Record<string, unknown> = {};
  if (input.title !== undefined) {
    const title = trimTo(input.title, MAX_TITLE);
    if (!title) {
      return { ok: false, error: "an event needs a title" };
    }
    patch.title = title;
  }
  if (input.details !== undefined) {
    patch.details = trimTo(input.details, MAX_TEXT);
  }
  if (input.pillar !== undefined) {
    patch.pillar = input.pillar;
  }
  if (input.priority !== undefined) {
    patch.priority = input.priority;
  }
  if (input.location !== undefined) {
    patch.location = trimTo(input.location, 300);
  }
  if (input.tags !== undefined) {
    patch.tags = input.tags.map((t) => t.trim().toLowerCase()).filter(Boolean);
  }
  if (input.plannedStartAt !== undefined) {
    patch.planned_start_at = iso(input.plannedStartAt);
  }
  if (input.plannedEndAt !== undefined) {
    patch.planned_end_at = iso(input.plannedEndAt);
  }
  if (input.reminderAt !== undefined) {
    patch.reminder_at = iso(input.reminderAt);
  }
  if (input.calendarEventId !== undefined) {
    patch.calendar_event_id = input.calendarEventId;
  }
  if (input.dailyLogId !== undefined) {
    patch.daily_log_id = input.dailyLogId;
  }
  if (Object.keys(patch).length === 0) {
    return { ok: false, error: "nothing to change" };
  }

  const { data, error } = await supabase
    .from(TABLE)
    .update(patch)
    .eq("user_profile_id", input.userProfileId)
    .eq("id", input.eventId)
    .is("deleted_at", null)
    .select("*")
    .maybeSingle();

  if (error) {
    logger.warn({ err: loggableError(error), eventId: input.eventId }, "magnus_events update failed");
    return { ok: false, error: describeEventError(error) };
  }
  if (!data) {
    return { ok: false, error: "no such event" };
  }
  return { ok: true, event: data as MagnusEventRow };
}

export type RescheduleMagnusEventInput = {
  userProfileId: string;
  eventId: string;
  newStartAt: Date;
  newEndAt?: Date | null;
  reason?: string | null;
  /** The event that took this one's slot, when there is one. */
  displacedByEventId?: string | null;
};

/**
 * Moves an event by opening its replacement. Returns the new row; the caller can read
 * `rescheduled_from_event_id` and `reschedule_count` to describe the move.
 */
export async function rescheduleMagnusEvent(
  input: RescheduleMagnusEventInput,
): Promise<
  { ok: true; event: MagnusEventRow; previous: MagnusEventRow } | { ok: false; error: string }
> {
  const previous = await getMagnusEvent(input.userProfileId, input.eventId);
  if (!previous) {
    return { ok: false, error: "no such event" };
  }
  if (previous.deleted_at) {
    return { ok: false, error: "that event was deleted" };
  }

  const { data, error } = await supabase.rpc("magnus_reschedule_event", {
    p_event_id: input.eventId,
    p_new_start: input.newStartAt.toISOString(),
    p_new_end: input.newEndAt ? input.newEndAt.toISOString() : null,
    p_reason: trimTo(input.reason, MAX_TEXT),
    p_displaced_by_event_id: input.displacedByEventId ?? null,
  });

  if (error) {
    logger.warn(
      { err: loggableError(error), eventId: input.eventId },
      "magnus_reschedule_event failed",
    );
    return { ok: false, error: describeEventError(error) };
  }

  const newId = typeof data === "string" ? data : null;
  if (!newId) {
    return { ok: false, error: "the reschedule did not return a new event" };
  }
  const created = await getMagnusEvent(input.userProfileId, newId);
  if (!created) {
    return { ok: false, error: "the replacement event could not be read back" };
  }
  return { ok: true, event: created, previous };
}

/** Soft delete: the row stays so the chain it belongs to keeps making sense. */
export async function deleteMagnusEvent(
  userProfileId: string,
  eventId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from(TABLE)
    .update({ deleted_at: new Date().toISOString() })
    .eq("user_profile_id", userProfileId)
    .eq("id", eventId);

  if (error) {
    logger.warn({ err: loggableError(error), eventId }, "magnus_events delete failed");
    return { ok: false, error: describeEventError(error) };
  }
  return { ok: true };
}

export async function listActivityStats(input: {
  userProfileId: string;
  activityKey?: string;
  pillar?: EventPillar;
  limit?: number;
}): Promise<ActivityStatsRow[]> {
  let q = supabase
    .from(STATS_VIEW)
    .select("*")
    .eq("user_profile_id", input.userProfileId);

  if (input.activityKey) {
    q = q.eq("activity_key", input.activityKey);
  }
  if (input.pillar) {
    q = q.eq("pillar", input.pillar);
  }

  const { data, error } = await q
    .order("times_planned", { ascending: false })
    .limit(Math.min(Math.max(input.limit ?? 12, 1), 100));

  if (error) {
    logger.warn(
      { err: loggableError(error), userProfileId: input.userProfileId },
      "magnus_activity_stats read failed",
    );
    return [];
  }
  return (data ?? []) as ActivityStatsRow[];
}

/**
 * Closes out plans whose time has passed. Called before anything that reasons about the day, so
 * "missed" is recorded rather than inferred from a stale 'planned' row.
 */
export async function markMissedMagnusEvents(
  userProfileId: string,
  graceHours = 2,
): Promise<number> {
  const { data, error } = await supabase.rpc("magnus_mark_missed_events", {
    p_user_profile_id: userProfileId,
    p_grace: `${Math.max(graceHours, 0)} hours`,
  });

  if (error) {
    logger.warn({ err: loggableError(error), userProfileId }, "magnus_mark_missed_events failed");
    return 0;
  }
  return typeof data === "number" ? data : 0;
}
