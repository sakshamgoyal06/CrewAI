/**
 * Google Calendar as Magnus tools. Returns plain text for the model rather than JSON: it reads
 * better in the reply and keeps token use down.
 *
 * Times are rendered in the user's timezone, because a model shown UTC will faithfully repeat UTC
 * back to someone who lives in Asia/Kolkata.
 */
import { googleCalendarConfigured } from "../../integrations/googleCalendar/auth.js";
import {
  createEvent,
  listEvents,
  type CalendarEventBrief,
} from "../../integrations/googleCalendar/operations.js";

const NOT_CONFIGURED =
  "Google Calendar is not connected. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_CALENDAR_REFRESH_TOKEN (see docs/GOOGLE_CALENDAR.md).";

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
  timeZone: string;
}): Promise<string> {
  if (!googleCalendarConfigured()) {
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
  });

  if (events.length === 0) {
    return "No events in that range.";
  }

  return events
    .map((e) => {
      const where = e.location ? ` @ ${e.location}` : "";
      return `- ${formatWhen(e, input.timeZone)} — ${e.summary}${where}`;
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
}): Promise<string> {
  if (!googleCalendarConfigured()) {
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
  });

  return `Created "${created.summary}" — ${formatWhen(created, input.timeZone)}.`;
}
