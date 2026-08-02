/**
 * Google Calendar as Magnus tools. Returns plain text for the model rather than JSON: it reads
 * better in the reply and keeps token use down.
 *
 * Times are rendered in the user's timezone, because a model shown UTC will faithfully repeat UTC
 * back to someone who lives in Asia/Kolkata.
 *
 * Read output carries the event id, which is how editing and deleting stay honest: Magnus has to
 * have read an event before it can change one. The ids are for the model, not the user — the system
 * prompt forbids showing them.
 */
import { googleCalendarConfigured } from "../../integrations/googleCalendar/auth.js";
import { loadUserIntegrations } from "../../users/userIntegrations.js";
import {
  syncEventLogAfterCalendarDelete,
  syncEventLogAfterCalendarUpdate,
} from "../../events/calendarEventSync.js";
import {
  createEvent,
  deleteEvent,
  getEvent,
  listEvents,
  updateEvent,
  type CalendarEventBrief,
} from "../../integrations/googleCalendar/operations.js";

const NOT_CONFIGURED =
  "Google Calendar is not connected for this account. Ask me to connect Google (one link covers Calendar and YouTube).";

async function calendarReady(userProfileId?: string): Promise<boolean> {
  if (googleCalendarConfigured()) {
    return true;
  }
  if (!userProfileId?.trim()) {
    return false;
  }
  const integrations = await loadUserIntegrations(userProfileId);
  return Boolean(
    integrations.googleCalendarRefreshToken &&
      process.env.GOOGLE_CLIENT_ID?.trim() &&
      process.env.GOOGLE_CLIENT_SECRET?.trim(),
  );
}

function formatWhen(event: CalendarEventBrief, timeZone: string): string {
  const allDay = !event.start.includes("T");
  if (allDay) {
    return `${event.start} (all day)`;
  }
  const start = new Date(event.start);
  const end = event.end ? new Date(event.end) : null;
  const day = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(start);
  const time = (d: Date): string =>
    new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(d);
  return end ? `${day} ${time(start)}–${time(end)}` : `${day} ${time(start)}`;
}

export async function readCalendarEvents(input: {
  startIso?: string;
  endIso?: string;
  query?: string;
  timeZone: string;
  userProfileId?: string;
}): Promise<string> {
  if (!(await calendarReady(input.userProfileId))) {
    return NOT_CONFIGURED;
  }

  const start = input.startIso ? new Date(input.startIso) : new Date();
  if (Number.isNaN(start.getTime())) {
    return `Could not read a date from "${input.startIso}".`;
  }
  const end = input.endIso
    ? new Date(input.endIso)
    : new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
  if (Number.isNaN(end.getTime())) {
    return `Could not read a date from "${input.endIso}".`;
  }

  const events = await listEvents({
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
    maxResults: 30,
    query: input.query,
    userProfileId: input.userProfileId,
  });

  if (events.length === 0) {
    return input.query
      ? `No events matching "${input.query}" in that range.`
      : "No events in that range.";
  }

  return events
    .map((e) => {
      const where = e.location ? ` @ ${e.location}` : "";
      return `- ${formatWhen(e, input.timeZone)} — ${e.summary}${where} [id: ${e.id}]`;
    })
    .join("\n");
}

export async function createCalendarEvent(input: {
  summary: string;
  startIso: string;
  endIso: string;
  description?: string;
  location?: string;
  timeZone: string;
  userProfileId?: string;
}): Promise<string> {
  if (!(await calendarReady(input.userProfileId))) {
    return NOT_CONFIGURED;
  }
  if (!input.summary.trim()) {
    return "An event needs a title.";
  }
  if (!input.startIso.trim() || !input.endIso.trim()) {
    return "An event needs both a start and an end.";
  }

  const created = await createEvent({
    summary: input.summary.trim(),
    start: input.startIso.trim(),
    end: input.endIso.trim(),
    description: input.description,
    location: input.location,
    timeZone: input.timeZone,
    userProfileId: input.userProfileId,
  });
  return `Created "${created.summary}" — ${formatWhen(created, input.timeZone)} [id: ${created.id}].`;
}

/**
 * Patch an existing event. A new start with no new end keeps the original duration, so "move gym to
 * 8am" does not silently turn a one-hour session into a zero-length one.
 */
export async function updateCalendarEvent(input: {
  eventId: string;
  summary?: string;
  startIso?: string;
  endIso?: string;
  description?: string;
  location?: string;
  timeZone: string;
  userProfileId?: string;
}): Promise<string> {
  if (!(await calendarReady(input.userProfileId))) {
    return NOT_CONFIGURED;
  }
  if (!input.eventId.trim()) {
    return "Read the calendar first — changing an event needs its id.";
  }

  const changes = [input.summary, input.startIso, input.endIso, input.description, input.location];
  if (changes.every((v) => v === undefined || v.trim() === "")) {
    return "Nothing to change — give a new title, time, location or description.";
  }

  const existing = await getEvent({
    eventId: input.eventId.trim(),
    userProfileId: input.userProfileId,
  });
  if (!existing) {
    return "That event no longer exists. Read the calendar again for current ids.";
  }

  let endIso = input.endIso?.trim() || undefined;
  if (input.startIso?.trim() && !endIso && existing.start.includes("T") && existing.end) {
    const durationMs = new Date(existing.end).getTime() - new Date(existing.start).getTime();
    const newStart = new Date(input.startIso.trim());
    if (!Number.isNaN(newStart.getTime()) && durationMs > 0) {
      // Keep the wall-clock offset out of it: Google reads the naive string against `timeZone`.
      endIso = new Date(newStart.getTime() + durationMs)
        .toISOString()
        .replace(/\.\d{3}Z$/, "");
    }
  }

  const updated = await updateEvent({
    eventId: input.eventId.trim(),
    summary: input.summary?.trim() || undefined,
    start: input.startIso?.trim() || undefined,
    end: endIso,
    description: input.description,
    location: input.location,
    timeZone: input.timeZone,
    userProfileId: input.userProfileId,
  });

  let syncNote = "";
  if (input.userProfileId?.trim() && input.startIso?.trim()) {
    const synced = await syncEventLogAfterCalendarUpdate({
      userProfileId: input.userProfileId.trim(),
      googleEventId: input.eventId.trim(),
      newStartIso: input.startIso.trim(),
      newEndIso: endIso,
      timeZone: input.timeZone,
    });
    if (synced) {
      syncNote = ` ${synced}`;
    }
  }

  return `Updated "${updated.summary}" — now ${formatWhen(updated, input.timeZone)}.${syncNote}`;
}

/** Deletes by id, and reports what was removed so a wrong deletion is obvious immediately. */
export async function deleteCalendarEvent(input: {
  eventId: string;
  timeZone: string;
  userProfileId?: string;
}): Promise<string> {
  if (!(await calendarReady(input.userProfileId))) {
    return NOT_CONFIGURED;
  }
  if (!input.eventId.trim()) {
    return "Read the calendar first — deleting an event needs its id.";
  }

  const existing = await getEvent({
    eventId: input.eventId.trim(),
    userProfileId: input.userProfileId,
  });
  if (!existing) {
    return "That event no longer exists — nothing to delete.";
  }

  await deleteEvent({
    eventId: input.eventId.trim(),
    userProfileId: input.userProfileId,
  });

  let syncNote = "";
  if (input.userProfileId?.trim()) {
    const synced = await syncEventLogAfterCalendarDelete({
      userProfileId: input.userProfileId.trim(),
      googleEventId: input.eventId.trim(),
      timeZone: input.timeZone,
    });
    if (synced) {
      syncNote = ` ${synced}`;
    }
  }

  return `Deleted "${existing.summary}" (was ${formatWhen(existing, input.timeZone)}).${syncNote}`;
}
