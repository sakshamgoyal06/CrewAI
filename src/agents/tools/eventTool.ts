/**
 * `magnus_events` as Magnus tools.
 *
 * Like the calendar tools, these return plain text rather than JSON: it reads better, costs fewer
 * tokens, and the ids ride along in `[id: …]` so a change can only act on something Magnus has
 * actually read. The system prompt forbids showing an id to the user.
 *
 * The division of labour with Google Calendar: the calendar holds the booking, this table holds
 * the intent and what became of it. Both get written for a real commitment, which is what makes
 * "you have moved this three times" answerable later.
 */
import {
  deleteMagnusEvent,
  getMagnusEvent,
  listActivityStats,
  listMagnusEvents,
  markMissedMagnusEvents,
  recordMagnusEvent,
  rescheduleMagnusEvent,
  updateMagnusEventStatus,
} from "../../events/eventsStore.js";
import {
  EVENT_STATUSES,
  isEventKind,
  isEventPriority,
  isSettableEventStatus,
  toEventPillar,
  type EventStatus,
  type MagnusEventRow,
} from "../../events/types.js";
import {
  endOfLocalDay,
  formatZonedDateTime,
  localDateKey,
  parseZonedTime,
} from "../../util/zonedTime.js";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function describeWhen(event: MagnusEventRow, timeZone: string): string {
  if (!event.planned_start_at) {
    return "no time set";
  }
  const zone = event.time_zone || timeZone;
  const start = new Date(event.planned_start_at);
  if (event.all_day) {
    return `${localDateKey(start, zone)} (all day)`;
  }
  const base = formatZonedDateTime(start, zone);
  if (!event.planned_end_at) {
    return base;
  }
  const end = new Date(event.planned_end_at);
  const endTime = formatZonedDateTime(end, zone).split(" ").pop();
  return `${base}–${endTime}`;
}

function describeOutcome(event: MagnusEventRow): string {
  const bits: string[] = [event.status];
  if (event.reschedule_count > 0) {
    bits.push(`moved ${event.reschedule_count}×`);
  }
  if (event.start_delay_minutes !== null && event.start_delay_minutes !== 0) {
    const late = event.start_delay_minutes > 0;
    bits.push(`started ${Math.abs(event.start_delay_minutes)}m ${late ? "late" : "early"}`);
  }
  if (event.actual_duration_minutes !== null) {
    bits.push(`${event.actual_duration_minutes}m long`);
  }
  if (event.quality_rating !== null) {
    bits.push(`rated ${event.quality_rating}/5`);
  }
  return bits.join(", ");
}

function formatEventLine(event: MagnusEventRow, timeZone: string): string {
  const parts = [
    `- ${describeWhen(event, timeZone)} — ${event.title}`,
    `[${event.pillar}]`,
    `(${describeOutcome(event)})`,
  ];
  if (event.details) {
    parts.push(`· ${event.details.slice(0, 200)}`);
  }
  if (event.outcome_note) {
    parts.push(`· note: ${event.outcome_note.slice(0, 200)}`);
  }
  return `${parts.join(" ")} [id: ${event.id}]`;
}

/** Logs a plan, or something already done. */
export async function planEvent(input: {
  userProfileId: string;
  timeZone: string;
  title: string;
  details?: string;
  pillar?: string;
  kind?: string;
  priority?: string;
  startIso?: string;
  endIso?: string;
  durationMinutes?: number;
  allDay?: boolean;
  status?: string;
  tags?: string[];
  location?: string;
  calendarEventId?: string;
  reminderMinutesBefore?: number;
  outcomeNote?: string;
  qualityRating?: number;
}): Promise<string> {
  const title = input.title?.trim();
  if (!title) {
    return "An event needs a title.";
  }

  const zone = input.timeZone;
  const start = input.startIso ? parseZonedTime(input.startIso, zone) : null;
  if (input.startIso && !start) {
    return `Could not read a time from "${input.startIso}".`;
  }

  let end = input.endIso ? parseZonedTime(input.endIso, zone) : null;
  if (input.endIso && !end) {
    return `Could not read a time from "${input.endIso}".`;
  }
  if (!end && start && input.durationMinutes && input.durationMinutes > 0) {
    end = new Date(start.getTime() + input.durationMinutes * 60000);
  }
  if (start && end && end.getTime() < start.getTime()) {
    return "That ends before it starts — check the times.";
  }

  const status = input.status && isSettableEventStatus(input.status) ? input.status : "planned";
  const finished = status === "done" || status === "partial";

  const reminderAt =
    start && input.reminderMinutesBefore && input.reminderMinutesBefore > 0
      ? new Date(start.getTime() - input.reminderMinutesBefore * 60000)
      : null;

  const saved = await recordMagnusEvent({
    userProfileId: input.userProfileId,
    title,
    details: input.details,
    pillar: toEventPillar(input.pillar),
    kind: input.kind && isEventKind(input.kind) ? input.kind : "event",
    priority: input.priority && isEventPriority(input.priority) ? input.priority : "normal",
    timeZone: zone,
    allDay: input.allDay ?? false,
    plannedStartAt: start,
    plannedEndAt: end,
    plannedDurationMinutes: !end && input.durationMinutes ? input.durationMinutes : null,
    status,
    // A plan logged as already finished has no separate record of when it ran.
    startedAt: finished ? start : null,
    endedAt: finished ? end : null,
    outcomeNote: input.outcomeNote,
    qualityRating: input.qualityRating,
    tags: input.tags,
    location: input.location,
    calendarEventId: input.calendarEventId,
    reminderAt,
    source: "telegram",
  });

  if (!saved.ok) {
    return `Could not log that: ${saved.error}.`;
  }
  const when = describeWhen(saved.event, zone);
  const verb = finished ? "Logged as done" : "Logged";
  return `${verb}: "${saved.event.title}" — ${when} [${saved.event.pillar}] [id: ${saved.event.id}]`;
}

/** Reads the log: a day, a range, a status, or a named activity. */
export async function listEvents(input: {
  userProfileId: string;
  timeZone: string;
  fromDate?: string;
  toDate?: string;
  days?: number;
  statuses?: string[];
  openOnly?: boolean;
  pillar?: string;
  query?: string;
  includeUnscheduled?: boolean;
  limit?: number;
}): Promise<string> {
  const zone = input.timeZone;
  const today = localDateKey(new Date(), zone);
  const fromKey = input.fromDate?.trim() || (input.query ? undefined : today);

  let from: Date | null = null;
  let to: Date | null = null;
  if (fromKey) {
    from = parseZonedTime(`${fromKey}T00:00:00`, zone);
    if (!from) {
      return `Could not read a date from "${fromKey}".`;
    }
    const span = input.toDate?.trim()
      ? null
      : Math.min(Math.max(input.days ?? 1, 1), 120);
    to = input.toDate?.trim()
      ? endOfLocalDay(input.toDate.trim(), zone)
      : endOfLocalDay(fromKey, zone, span ?? 1);
    if (!to) {
      return `Could not read a date from "${input.toDate}".`;
    }
  }

  const statuses = input.statuses
    ?.map((s) => s.trim().toLowerCase())
    .filter((s): s is EventStatus => (EVENT_STATUSES as readonly string[]).includes(s));

  const pillar = input.pillar ? toEventPillar(input.pillar) : undefined;

  const result = await listMagnusEvents({
    userProfileId: input.userProfileId,
    from,
    to,
    statuses: statuses?.length ? statuses : undefined,
    openOnly: input.openOnly,
    pillar: pillar && pillar !== "general" ? pillar : undefined,
    query: input.query,
    includeUnscheduled: input.includeUnscheduled,
    limit: input.limit,
  });

  if (!result.ok) {
    return `Could not read the log: ${result.error}.`;
  }
  if (result.events.length === 0) {
    return input.query
      ? `Nothing logged matching "${input.query}".`
      : "Nothing logged for that range.";
  }
  return result.events.map((e) => formatEventLine(e, zone)).join("\n");
}

/** Records how something ended. */
export async function setEventStatus(input: {
  userProfileId: string;
  timeZone: string;
  eventId: string;
  status: string;
  note?: string;
  qualityRating?: number;
  startedIso?: string;
  endedIso?: string;
}): Promise<string> {
  const eventId = input.eventId?.trim();
  if (!eventId) {
    return "Read the log first — changing an entry needs its id.";
  }
  const status = input.status?.trim().toLowerCase() ?? "";
  if (!isSettableEventStatus(status)) {
    return "Status must be one of: planned, in_progress, done, partial, skipped, missed, cancelled. To move something, reschedule it instead.";
  }

  const zone = input.timeZone;
  const startedAt = input.startedIso ? parseZonedTime(input.startedIso, zone) : undefined;
  if (input.startedIso && !startedAt) {
    return `Could not read a time from "${input.startedIso}".`;
  }
  const endedAt = input.endedIso ? parseZonedTime(input.endedIso, zone) : undefined;
  if (input.endedIso && !endedAt) {
    return `Could not read a time from "${input.endedIso}".`;
  }

  const updated = await updateMagnusEventStatus({
    userProfileId: input.userProfileId,
    eventId,
    status,
    outcomeNote: input.note,
    qualityRating: input.qualityRating,
    startedAt,
    endedAt,
  });

  if (!updated.ok) {
    return `Could not update that: ${updated.error}.`;
  }
  const e = updated.event;
  return `"${e.title}" (${describeWhen(e, zone)}) is now ${e.status}${
    e.start_delay_minutes ? `, started ${Math.abs(e.start_delay_minutes)}m ${e.start_delay_minutes > 0 ? "late" : "early"}` : ""
  }.`;
}

/** Moves an event to a new time, leaving the original behind as history. */
export async function rescheduleEvent(input: {
  userProfileId: string;
  timeZone: string;
  eventId: string;
  newStartIso: string;
  newEndIso?: string;
  reason?: string;
}): Promise<string> {
  const eventId = input.eventId?.trim();
  if (!eventId) {
    return "Read the log first — moving an entry needs its id.";
  }
  const zone = input.timeZone;
  const newStart = parseZonedTime(input.newStartIso ?? "", zone);
  if (!newStart) {
    return `Could not read a time from "${input.newStartIso}".`;
  }
  const newEnd = input.newEndIso ? parseZonedTime(input.newEndIso, zone) : null;
  if (input.newEndIso && !newEnd) {
    return `Could not read a time from "${input.newEndIso}".`;
  }

  const moved = await rescheduleMagnusEvent({
    userProfileId: input.userProfileId,
    eventId,
    newStartAt: newStart,
    newEndAt: newEnd,
    reason: input.reason,
  });

  if (!moved.ok) {
    return `Could not move that: ${moved.error}.`;
  }

  const { event, previous } = moved;
  const direction = previous.planned_start_at
    ? new Date(previous.planned_start_at).getTime() > newStart.getTime()
      ? "Preponed"
      : "Postponed"
    : "Scheduled";
  const drift =
    event.original_planned_start_at && event.reschedule_count > 1
      ? ` ${event.reschedule_count} moves since first planned for ${formatZonedDateTime(
          new Date(event.original_planned_start_at),
          zone,
        )}.`
      : "";

  return `${direction} "${event.title}" from ${describeWhen(previous, zone)} to ${describeWhen(
    event,
    zone,
  )}.${drift} [id: ${event.id}]`;
}

/** Removes an entry logged by mistake. */
export async function dropEvent(input: {
  userProfileId: string;
  timeZone: string;
  eventId: string;
}): Promise<string> {
  const eventId = input.eventId?.trim();
  if (!eventId) {
    return "Read the log first — removing an entry needs its id.";
  }
  const existing = await getMagnusEvent(input.userProfileId, eventId);
  if (!existing) {
    return "No such entry in the log.";
  }
  const removed = await deleteMagnusEvent(input.userProfileId, eventId);
  if (!removed.ok) {
    return `Could not remove that: ${removed.error}.`;
  }
  return `Removed "${existing.title}" (${describeWhen(existing, input.timeZone)}) from the log.`;
}

/**
 * What the log says about how an activity actually goes: how often it happens, how often it slips,
 * when it usually sits, and how late it usually starts.
 */
export async function summariseActivity(input: {
  userProfileId: string;
  pillar?: string;
  activityKey?: string;
  limit?: number;
}): Promise<string> {
  const pillar = input.pillar ? toEventPillar(input.pillar) : undefined;
  const rows = await listActivityStats({
    userProfileId: input.userProfileId,
    activityKey: input.activityKey?.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_") || undefined,
    pillar: pillar && pillar !== "general" ? pillar : undefined,
    limit: input.limit,
  });

  if (rows.length === 0) {
    return "Nothing in the log to summarise yet.";
  }

  return rows
    .map((r) => {
      const total =
        r.times_done + r.times_missed + r.times_skipped + r.times_cancelled + r.times_postponed;
      const bits = [`${r.sample_title} [${r.pillar}]`];
      bits.push(`${r.times_done} done`);
      if (r.times_missed) {
        bits.push(`${r.times_missed} missed`);
      }
      if (r.times_skipped) {
        bits.push(`${r.times_skipped} skipped`);
      }
      if (r.times_postponed) {
        bits.push(`${r.times_postponed} postponed`);
      }
      if (r.times_preponed) {
        bits.push(`${r.times_preponed} pulled earlier`);
      }
      if (total > 0) {
        bits.push(`${Math.round((r.times_done / total) * 100)}% follow-through`);
      }
      if (r.usual_local_time) {
        const dow =
          r.usual_local_dow !== null ? ` on ${DAY_NAMES[r.usual_local_dow] ?? "?"}` : "";
        bits.push(`usually ${r.usual_local_time.slice(0, 5)}${dow}`);
      }
      if (r.avg_start_delay_minutes) {
        const late = r.avg_start_delay_minutes > 0;
        bits.push(
          `typically starts ${Math.abs(Math.round(r.avg_start_delay_minutes))}m ${
            late ? "late" : "early"
          }`,
        );
      }
      if (r.avg_actual_duration_minutes) {
        bits.push(`~${Math.round(r.avg_actual_duration_minutes)}m each`);
      }
      if (r.avg_quality_rating) {
        bits.push(`rated ${r.avg_quality_rating}/5`);
      }
      return `- ${bits.join(", ")}`;
    })
    .join("\n");
}

/** Marks anything whose time has passed as missed, so the day's picture is truthful. */
export async function closeOutStalePlans(
  userProfileId: string,
  graceHours = 2,
): Promise<number> {
  return await markMissedMagnusEvents(userProfileId, graceHours);
}
