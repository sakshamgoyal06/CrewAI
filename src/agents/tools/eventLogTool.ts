/**
 * The event log as Magnus tools: plan something, say what became of it, move it, look it up.
 *
 * Everything returns plain text, including the failure cases, because a tool result the model
 * cannot read is a tool result the model will invent around.
 *
 * @see src/events/eventStore.ts
 * @see supabase/migrations/20260731120000_magnus_events.sql
 */
import {
  activityStats,
  createEvent,
  getEvent,
  getEventChain,
  listEvents,
  rescheduleEvent,
  updateEvent,
} from "../../events/eventStore.js";
import {
  describeEvent,
  formatActivityStats,
  formatEventChain,
  formatEventList,
} from "../../events/formatEvents.js";
import {
  formatInstant,
  isDateOnly,
  startOfLocalDay,
  zonedTimeToInstant,
} from "../../events/eventTime.js";
import {
  SUPERSEDED_STATUSES,
  activityKeyFor,
  normalizePillar,
  normalizeRescheduleKind,
  normalizeStatus,
  type EventStatus,
} from "../../events/eventTypes.js";

const DAY_MS = 24 * 60 * 60 * 1000;

type TimeParse = { ok: true; at: Date | null; dateOnly: boolean } | { ok: false; message: string };

function parseTime(value: string | undefined, timeZone: string, label: string): TimeParse {
  const raw = value?.trim();
  if (!raw) {
    return { ok: true, at: null, dateOnly: false };
  }
  const at = zonedTimeToInstant(raw, timeZone);
  if (!at) {
    return { ok: false, message: `Could not read a ${label} from "${raw}".` };
  }
  return { ok: true, at, dateOnly: isDateOnly(raw) };
}

function statusesFor(filter: string | undefined): EventStatus[] | undefined {
  const raw = filter?.trim().toLowerCase();
  if (!raw || raw === "all") {
    return undefined;
  }
  if (raw === "open") {
    return ["planned", "in_progress"];
  }
  if (raw === "closed") {
    return ["done", "partial", "skipped", "missed", "cancelled"];
  }
  if (raw === "slipped") {
    return ["missed", "postponed", "preponed", "skipped"];
  }
  const parsed = raw
    .split(",")
    .map((s) => normalizeStatus(s))
    .filter((s): s is EventStatus => s !== null);
  return parsed.length > 0 ? parsed : undefined;
}

export type LogEventInput = {
  userProfileId: string;
  timeZone: string;
  title: string;
  details?: string;
  pillar?: string;
  activity?: string;
  start?: string;
  end?: string;
  durationMinutes?: number;
  status?: string;
  actualStart?: string;
  actualEnd?: string;
  note?: string;
  reason?: string;
  priority?: number;
  tags?: string[];
  calendarEventId?: string;
  remindAt?: string;
};

/** Records a commitment: something planned, or something that already happened. */
export async function logEvent(input: LogEventInput): Promise<string> {
  const title = input.title?.trim();
  if (!title) {
    return "An event needs a title.";
  }

  const timeZone = input.timeZone || "UTC";
  const status = input.status ? normalizeStatus(input.status) : "planned";
  if (!status) {
    return `"${input.status}" is not a status I record. Use planned, in_progress, done, partial, skipped, missed or cancelled.`;
  }
  if (SUPERSEDED_STATUSES.includes(status)) {
    return "Postponing or preponing is a move, not a new entry — use reschedule_event on the original.";
  }

  const start = parseTime(input.start, timeZone, "start time");
  if (!start.ok) {
    return start.message;
  }
  const end = parseTime(input.end, timeZone, "end time");
  if (!end.ok) {
    return end.message;
  }
  const actualStart = parseTime(input.actualStart, timeZone, "start time");
  if (!actualStart.ok) {
    return actualStart.message;
  }
  const actualEnd = parseTime(input.actualEnd, timeZone, "end time");
  if (!actualEnd.ok) {
    return actualEnd.message;
  }
  const remindAt = parseTime(input.remindAt, timeZone, "reminder time");
  if (!remindAt.ok) {
    return remindAt.message;
  }

  if (start.at && end.at && end.at.getTime() < start.at.getTime()) {
    return "That ends before it starts — check the times.";
  }
  if (actualStart.at && actualEnd.at && actualEnd.at.getTime() < actualStart.at.getTime()) {
    return "The finish time is before the start time — check them.";
  }

  const saved = await createEvent({
    userProfileId: input.userProfileId,
    title,
    details: input.details,
    pillar: input.pillar,
    activity: input.activity,
    tags: input.tags,
    priority: input.priority,
    timeZone,
    plannedStartAt: start.at,
    plannedEndAt: end.at,
    plannedMinutes: input.durationMinutes ?? null,
    allDay: start.dateOnly,
    status,
    startedAt: actualStart.at,
    endedAt: actualEnd.at,
    outcomeNote: input.note,
    reason: input.reason,
    remindAt: remindAt.at,
    googleEventId: input.calendarEventId,
    createdBy: "magnus",
  });

  if (!saved.ok) {
    const correction = saved.error.match(/^correction_use_reschedule:(.+)$/);
    if (correction) {
      const existing = await getEvent({
        userProfileId: input.userProfileId,
        eventId: correction[1],
      });
      const when = existing.ok && existing.data
        ? describeEvent(existing.data, timeZone)
        : "the open entry you just logged";
      return (
        `You already logged this commitment as ${when}. ` +
        `Do not log it again — use reschedule_event on id ${correction[1]} to move it to the new time.`
      );
    }
    return `Could not save that to the event log: ${saved.error}.`;
  }
  if (saved.data.duplicate) {
    return `Already logged: ${describeEvent(saved.data.event, timeZone)}. Nothing new written.`;
  }
  const unscheduled = !start.at ? " No time on it yet." : "";
  return `Logged: ${describeEvent(saved.data.event, timeZone)}.${unscheduled}`;
}

export type UpdateEventStatusInput = {
  userProfileId: string;
  timeZone: string;
  eventId: string;
  status?: string;
  note?: string;
  reason?: string;
  actualStart?: string;
  actualEnd?: string;
  details?: string;
  calendarEventId?: string;
  remindAt?: string;
};

/** Records what became of a commitment that already exists. */
export async function updateEventStatus(input: UpdateEventStatusInput): Promise<string> {
  const eventId = input.eventId?.trim();
  if (!eventId) {
    return "Look the event up first — changing one needs its id.";
  }
  const timeZone = input.timeZone || "UTC";

  let status: EventStatus | undefined;
  if (input.status?.trim()) {
    const parsed = normalizeStatus(input.status);
    if (!parsed) {
      return `"${input.status}" is not a status I record. Use planned, in_progress, done, partial, skipped, missed or cancelled.`;
    }
    if (SUPERSEDED_STATUSES.includes(parsed)) {
      return "Moving something to another time is reschedule_event, not a status change — that way the new slot is recorded too.";
    }
    status = parsed;
  }

  const actualStart = parseTime(input.actualStart, timeZone, "start time");
  if (!actualStart.ok) {
    return actualStart.message;
  }
  const actualEnd = parseTime(input.actualEnd, timeZone, "end time");
  if (!actualEnd.ok) {
    return actualEnd.message;
  }
  const remindAt = parseTime(input.remindAt, timeZone, "reminder time");
  if (!remindAt.ok) {
    return remindAt.message;
  }

  const updated = await updateEvent({
    userProfileId: input.userProfileId,
    eventId,
    status,
    outcomeNote: input.note,
    reason: input.reason,
    details: input.details,
    ...(actualStart.at ? { startedAt: actualStart.at } : {}),
    ...(actualEnd.at ? { endedAt: actualEnd.at } : {}),
    ...(input.calendarEventId ? { googleEventId: input.calendarEventId } : {}),
    ...(input.remindAt !== undefined ? { remindAt: remindAt.at } : {}),
  });

  if (!updated.ok) {
    return `Could not update that entry: ${updated.error}.`;
  }
  return `Updated: ${describeEvent(updated.data, timeZone)}.`;
}

export type RescheduleEventToolInput = {
  userProfileId: string;
  timeZone: string;
  eventId: string;
  newStart?: string;
  newEnd?: string;
  kind?: string;
  reason?: string;
};

/** Moves a commitment to a new time, keeping the old entry as history. */
export async function rescheduleEventTool(input: RescheduleEventToolInput): Promise<string> {
  const eventId = input.eventId?.trim();
  if (!eventId) {
    return "Look the event up first — moving one needs its id.";
  }
  const timeZone = input.timeZone || "UTC";

  const newStart = parseTime(input.newStart, timeZone, "new start time");
  if (!newStart.ok) {
    return newStart.message;
  }
  const newEnd = parseTime(input.newEnd, timeZone, "new end time");
  if (!newEnd.ok) {
    return newEnd.message;
  }
  if (newStart.at && newEnd.at && newEnd.at.getTime() < newStart.at.getTime()) {
    return "The new end is before the new start — check the times.";
  }

  const kind = input.kind ? normalizeRescheduleKind(input.kind) : null;
  if (input.kind?.trim() && !kind) {
    return `"${input.kind}" is not a kind of move. Use postponed, preponed or rescheduled.`;
  }

  const moved = await rescheduleEvent({
    userProfileId: input.userProfileId,
    eventId,
    newStartAt: newStart.at,
    newEndAt: newEnd.at,
    kind,
    reason: input.reason,
    timeZone,
  });

  if (!moved.ok) {
    return `Could not move that entry: ${moved.error}.`;
  }

  const { previous, next } = moved.data;
  const from = previous.planned_start_at
    ? formatInstant(new Date(previous.planned_start_at), previous.time_zone || timeZone)
    : "no time";
  const to = next.planned_start_at
    ? formatInstant(new Date(next.planned_start_at), next.time_zone || timeZone)
    : "no time yet";
  const because = next.reschedule_kind === "preponed" ? "pulled forward" : "pushed back";
  const reason = previous.reason?.trim() ? ` Reason: ${previous.reason.trim()}.` : "";
  return (
    `Moved "${next.title}" — ${because} from ${from} to ${to}. ` +
    `The old entry is closed as ${next.reschedule_kind} and the new one is planned.${reason} [id: ${next.id}]`
  );
}

export type ListEventsToolInput = {
  userProfileId: string;
  timeZone: string;
  from?: string;
  to?: string;
  status?: string;
  pillar?: string;
  activity?: string;
  query?: string;
  eventId?: string;
  includeStats?: boolean;
  includeUnscheduled?: boolean;
  limit?: number;
};

/** Reads the log: what is on, what happened, and the rhythm behind it. */
export async function listEventsTool(input: ListEventsToolInput): Promise<string> {
  const timeZone = input.timeZone || "UTC";
  const now = new Date();

  // A specific id means "tell me this one's whole story", moves included.
  if (input.eventId?.trim()) {
    const one = await getEvent({
      userProfileId: input.userProfileId,
      eventId: input.eventId.trim(),
    });
    if (!one.ok) {
      return `Could not read that entry: ${one.error}.`;
    }
    if (!one.data) {
      return "No event with that id.";
    }
    const chain = await getEventChain({
      userProfileId: input.userProfileId,
      rootEventId: one.data.root_event_id,
    });
    const history = chain.ok && chain.data.length > 1 ? `\n\nHistory:\n→ ${formatEventChain(chain.data, timeZone)}` : "";
    return `${formatEventList([one.data], timeZone, { now })}${history}`;
  }

  const from = parseTime(input.from, timeZone, "start date");
  if (!from.ok) {
    return from.message;
  }
  const to = parseTime(input.to, timeZone, "end date");
  if (!to.ok) {
    return to.message;
  }

  // Default window: yesterday through the coming week — enough to answer "what is on" and "what
  // did I let slip" without a second call.
  const rangeStart = from.at ?? startOfLocalDay(now, timeZone, -1);
  let rangeEnd = to.at;
  if (rangeEnd && to.dateOnly) {
    rangeEnd = new Date(rangeEnd.getTime() + DAY_MS - 1);
  }
  if (!rangeEnd) {
    rangeEnd = new Date(rangeStart.getTime() + 8 * DAY_MS);
  }
  if (rangeEnd.getTime() < rangeStart.getTime()) {
    return "That range ends before it starts.";
  }

  const activityKey = input.activity?.trim()
    ? activityKeyFor({ activity: input.activity, title: input.activity })
    : null;

  const rows = await listEvents({
    userProfileId: input.userProfileId,
    from: rangeStart,
    to: rangeEnd,
    statuses: statusesFor(input.status),
    pillar: input.pillar?.trim() ? normalizePillar(input.pillar) : null,
    activityKey,
    titleQuery: input.query,
    includeUnscheduled: input.includeUnscheduled ?? false,
    limit: input.limit,
  });

  if (!rows.ok) {
    return `Could not read the event log: ${rows.error}.`;
  }

  const header = `Events ${formatInstant(rangeStart, timeZone, { dateOnly: true })} → ${formatInstant(rangeEnd, timeZone, { dateOnly: true })}:`;
  const body = formatEventList(rows.data, timeZone, {
    now,
    empty: "Nothing logged in that range.",
  });

  if (!input.includeStats) {
    return `${header}\n${body}`;
  }

  const stats = await activityStats({
    userProfileId: input.userProfileId,
    activityKey,
  });
  const statsText = stats.ok
    ? formatActivityStats(stats.data)
    : `Rhythm unavailable: ${stats.error}.`;
  return `${header}\n${body}\n\nRhythm and adherence (all time):\n${statsText}`;
}
