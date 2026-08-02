import type { calendar_v3 } from "googleapis";

import { getAuthenticatedCalendarClient } from "./auth.js";
import { defaultEventWindow } from "./dateRange.js";

export type CalendarEventBrief = {
  id: string;
  summary: string;
  start: string;
  end: string;
  location?: string;
  description?: string;
  calendarId: string;
};

function formatEvent(
  e: calendar_v3.Schema$Event,
  calendarId: string,
): CalendarEventBrief | null {
  if (!e.id) {
    return null;
  }
  const start = e.start?.dateTime ?? e.start?.date ?? "";
  const end = e.end?.dateTime ?? e.end?.date ?? "";
  return {
    id: e.id,
    summary: e.summary ?? "(no title)",
    start,
    end,
    location: e.location ?? undefined,
    description: e.description ?? undefined,
    calendarId,
  };
}

export async function listCalendars(): Promise<{ id: string; summary: string; primary?: boolean }[]> {
  const { calendar } = await getAuthenticatedCalendarClient();
  const res = await calendar.calendarList.list();
  return (res.data.items ?? []).map((c) => ({
    id: c.id ?? "",
    summary: c.summary ?? c.id ?? "calendar",
    primary: c.primary ?? undefined,
  }));
}

export async function listEvents(input: {
  calendarId?: string;
  timeMin?: string;
  timeMax?: string;
  maxResults?: number;
  query?: string;
  userProfileId?: string;
}): Promise<CalendarEventBrief[]> {
  const { calendar } = await getAuthenticatedCalendarClient(input.userProfileId);
  const calendarId = input.calendarId ?? "primary";
  const window = defaultEventWindow();
  const res = await calendar.events.list({
    calendarId,
    timeMin: input.timeMin ?? window.timeMin,
    timeMax: input.timeMax ?? window.timeMax,
    maxResults: input.maxResults ?? 25,
    singleEvents: true,
    orderBy: "startTime",
    q: input.query,
  });
  return (res.data.items ?? [])
    .map((e) => formatEvent(e, calendarId))
    .filter((e): e is CalendarEventBrief => e !== null);
}

export async function getEvent(input: {
  calendarId?: string;
  eventId: string;
  userProfileId?: string;
}): Promise<CalendarEventBrief | null> {
  const { calendar } = await getAuthenticatedCalendarClient(input.userProfileId);
  const calendarId = input.calendarId ?? "primary";
  const res = await calendar.events.get({ calendarId, eventId: input.eventId });
  return formatEvent(res.data, calendarId);
}

export async function getFreeBusy(input: {
  timeMin: string;
  timeMax: string;
  calendarIds?: string[];
}): Promise<Record<string, { start: string; end: string }[]>> {
  const { calendar } = await getAuthenticatedCalendarClient();
  const ids = input.calendarIds?.length ? input.calendarIds : ["primary"];
  const res = await calendar.freebusy.query({
    requestBody: {
      timeMin: input.timeMin,
      timeMax: input.timeMax,
      items: ids.map((id) => ({ id })),
    },
  });
  const out: Record<string, { start: string; end: string }[]> = {};
  const cal = res.data.calendars ?? {};
  for (const id of ids) {
    out[id] = (cal[id]?.busy ?? []).map((b) => ({
      start: b.start ?? "",
      end: b.end ?? "",
    }));
  }
  return out;
}

export async function createEvent(input: {
  calendarId?: string;
  summary: string;
  description?: string;
  location?: string;
  start: string;
  end: string;
  timeZone?: string;
  userProfileId?: string;
}): Promise<CalendarEventBrief> {
  const { calendar } = await getAuthenticatedCalendarClient(input.userProfileId);
  const calendarId = input.calendarId ?? "primary";
  const tz = input.timeZone ?? "UTC";
  const res = await calendar.events.insert({
    calendarId,
    requestBody: {
      summary: input.summary,
      description: input.description,
      location: input.location,
      start: input.start.includes("T")
        ? { dateTime: input.start, timeZone: tz }
        : { date: input.start },
      end: input.end.includes("T")
        ? { dateTime: input.end, timeZone: tz }
        : { date: input.end },
    },
  });
  const brief = formatEvent(res.data, calendarId);
  if (!brief) {
    throw new Error("Created event but response missing id");
  }
  return brief;
}

export async function updateEvent(input: {
  calendarId?: string;
  eventId: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: string;
  end?: string;
  timeZone?: string;
  userProfileId?: string;
}): Promise<CalendarEventBrief> {
  const { calendar } = await getAuthenticatedCalendarClient(input.userProfileId);
  const calendarId = input.calendarId ?? "primary";
  const tz = input.timeZone ?? "UTC";
  const body: calendar_v3.Schema$Event = {};
  if (input.summary !== undefined) body.summary = input.summary;
  if (input.description !== undefined) body.description = input.description;
  if (input.location !== undefined) body.location = input.location;
  if (input.start) {
    body.start = input.start.includes("T")
      ? { dateTime: input.start, timeZone: tz }
      : { date: input.start };
  }
  if (input.end) {
    body.end = input.end.includes("T")
      ? { dateTime: input.end, timeZone: tz }
      : { date: input.end };
  }
  const res = await calendar.events.patch({
    calendarId,
    eventId: input.eventId,
    requestBody: body,
  });
  const brief = formatEvent(res.data, calendarId);
  if (!brief) {
    throw new Error("Updated event but response missing id");
  }
  return brief;
}

export async function deleteEvent(input: {
  calendarId?: string;
  eventId: string;
  userProfileId?: string;
}): Promise<{ deleted: true; eventId: string }> {
  const { calendar } = await getAuthenticatedCalendarClient(input.userProfileId);
  const calendarId = input.calendarId ?? "primary";
  await calendar.events.delete({ calendarId, eventId: input.eventId });
  return { deleted: true, eventId: input.eventId };
}
