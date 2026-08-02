import { beforeEach, describe, expect, it, vi } from "vitest";

const configuredMock = vi.hoisted(() => vi.fn());
const listEventsMock = vi.hoisted(() => vi.fn());
const createEventMock = vi.hoisted(() => vi.fn());
const getEventMock = vi.hoisted(() => vi.fn());
const updateEventMock = vi.hoisted(() => vi.fn());
const deleteEventMock = vi.hoisted(() => vi.fn());

vi.mock("../../integrations/googleCalendar/auth.js", () => ({
  googleCalendarConfigured: configuredMock,
}));

vi.mock("../../integrations/googleCalendar/operations.js", () => ({
  listEvents: listEventsMock,
  createEvent: createEventMock,
  getEvent: getEventMock,
  updateEvent: updateEventMock,
  deleteEvent: deleteEventMock,
}));

vi.mock("../../events/calendarEventSync.js", () => ({
  syncEventLogAfterCalendarDelete: vi.fn().mockResolvedValue(null),
  syncEventLogAfterCalendarUpdate: vi.fn().mockResolvedValue(null),
}));

vi.mock("../../users/userIntegrations.js", () => ({
  loadUserIntegrations: vi.fn().mockResolvedValue({}),
}));

import {
  createCalendarEvent,
  deleteCalendarEvent,
  readCalendarEvents,
  updateCalendarEvent,
} from "./calendarTool.js";

const IST = "Asia/Kolkata";

describe("readCalendarEvents", () => {
  beforeEach(() => {
    configuredMock.mockReset();
    listEventsMock.mockReset();
    configuredMock.mockReturnValue(true);
  });

  it("explains what to set when Calendar is not connected", async () => {
    configuredMock.mockReturnValue(false);
    const out = await readCalendarEvents({ timeZone: IST });
    expect(out).toContain("not connected");
    expect(listEventsMock).not.toHaveBeenCalled();
  });

  it("renders times in the user's timezone, not UTC", async () => {
    listEventsMock.mockResolvedValue([
      {
        id: "1",
        summary: "Standup",
        start: "2026-07-28T03:30:00.000Z",
        end: "2026-07-28T04:00:00.000Z",
        calendarId: "primary",
      },
    ]);

    const out = await readCalendarEvents({ timeZone: IST });

    // 03:30Z is 09:00 in IST.
    expect(out).toContain("09:00");
    expect(out).toContain("Standup");
    expect(out).not.toContain("03:30");
  });

  it("marks all-day events and includes location", async () => {
    listEventsMock.mockResolvedValue([
      {
        id: "1",
        summary: "Holiday",
        start: "2026-08-15",
        end: "2026-08-16",
        calendarId: "primary",
      },
      {
        id: "2",
        summary: "Dentist",
        start: "2026-07-28T09:30:00.000Z",
        end: "2026-07-28T10:00:00.000Z",
        location: "Indiranagar",
        calendarId: "primary",
      },
    ]);

    const out = await readCalendarEvents({ timeZone: IST });

    expect(out).toContain("(all day)");
    expect(out).toContain("@ Indiranagar");
  });

  it("includes the event id so edits and deletes can reference it", async () => {
    listEventsMock.mockResolvedValue([
      {
        id: "evt_abc123",
        summary: "Gym",
        start: "2026-07-28T01:30:00.000Z",
        end: "2026-07-28T02:30:00.000Z",
        calendarId: "primary",
      },
    ]);
    expect(await readCalendarEvents({ timeZone: IST })).toContain("[id: evt_abc123]");
  });

  it("passes a query through and reports when it matches nothing", async () => {
    listEventsMock.mockResolvedValue([]);
    const out = await readCalendarEvents({ query: "dentist", timeZone: IST });
    expect(listEventsMock).toHaveBeenCalledWith(expect.objectContaining({ query: "dentist" }));
    expect(out).toContain('matching "dentist"');
  });

  it("says so when the range is empty", async () => {
    listEventsMock.mockResolvedValue([]);
    expect(await readCalendarEvents({ timeZone: IST })).toBe("No events in that range.");
  });

  it("defaults the range to a week from the start", async () => {
    listEventsMock.mockResolvedValue([]);
    await readCalendarEvents({ startIso: "2026-07-28T00:00:00.000Z", timeZone: IST });

    const arg = listEventsMock.mock.calls[0]?.[0] as { timeMin: string; timeMax: string };
    const days =
      (new Date(arg.timeMax).getTime() - new Date(arg.timeMin).getTime()) / 86_400_000;
    expect(days).toBeCloseTo(7);
  });

  it("rejects an unparseable date rather than guessing", async () => {
    const out = await readCalendarEvents({ startIso: "next tuesday", timeZone: IST });
    expect(out).toContain("Could not read a date");
    expect(listEventsMock).not.toHaveBeenCalled();
  });
});

describe("createCalendarEvent", () => {
  beforeEach(() => {
    configuredMock.mockReset();
    createEventMock.mockReset();
    configuredMock.mockReturnValue(true);
  });

  it("confirms the created event with its local time", async () => {
    createEventMock.mockResolvedValue({
      id: "1",
      summary: "Gym",
      start: "2026-07-28T01:30:00.000Z",
      end: "2026-07-28T02:30:00.000Z",
      calendarId: "primary",
    });

    const out = await createCalendarEvent({
      summary: "Gym",
      startIso: "2026-07-28T07:00:00",
      endIso: "2026-07-28T08:00:00",
      timeZone: IST,
    });

    expect(out).toContain('Created "Gym"');
    expect(out).toContain("07:00");
  });

  it("refuses incomplete input without calling the API", async () => {
    expect(
      await createCalendarEvent({
        summary: "  ",
        startIso: "2026-07-28T07:00:00",
        endIso: "2026-07-28T08:00:00",
        timeZone: IST,
      }),
    ).toContain("needs a title");

    expect(
      await createCalendarEvent({
        summary: "Gym",
        startIso: "",
        endIso: "",
        timeZone: IST,
      }),
    ).toContain("start and an end");

    expect(createEventMock).not.toHaveBeenCalled();
  });
});

describe("updateCalendarEvent", () => {
  beforeEach(() => {
    configuredMock.mockReset();
    getEventMock.mockReset();
    updateEventMock.mockReset();
    configuredMock.mockReturnValue(true);
  });

  const EXISTING = {
    id: "evt_1",
    summary: "Gym",
    start: "2026-07-28T01:30:00.000Z",
    end: "2026-07-28T02:30:00.000Z",
    calendarId: "primary",
  };

  it("keeps the original duration when only a new start is given", async () => {
    getEventMock.mockResolvedValue(EXISTING);
    updateEventMock.mockResolvedValue({
      ...EXISTING,
      start: "2026-07-28T02:30:00.000Z",
      end: "2026-07-28T03:30:00.000Z",
    });

    await updateCalendarEvent({
      eventId: "evt_1",
      startIso: "2026-07-28T08:00:00",
      timeZone: IST,
    });

    const arg = updateEventMock.mock.calls[0]?.[0] as { start?: string; end?: string };
    expect(arg.start).toBe("2026-07-28T08:00:00");
    // One hour later, matching the event's original length.
    expect(arg.end).toBe("2026-07-28T09:00:00");
  });

  it("respects an explicit end", async () => {
    getEventMock.mockResolvedValue(EXISTING);
    updateEventMock.mockResolvedValue(EXISTING);

    await updateCalendarEvent({
      eventId: "evt_1",
      startIso: "2026-07-28T08:00:00",
      endIso: "2026-07-28T10:00:00",
      timeZone: IST,
    });

    const arg = updateEventMock.mock.calls[0]?.[0] as { end?: string };
    expect(arg.end).toBe("2026-07-28T10:00:00");
  });

  it("refuses without an id or without any change", async () => {
    expect(await updateCalendarEvent({ eventId: "  ", timeZone: IST })).toContain("needs its id");
    expect(await updateCalendarEvent({ eventId: "evt_1", timeZone: IST })).toContain(
      "Nothing to change",
    );
    expect(updateEventMock).not.toHaveBeenCalled();
  });

  it("reports a stale id instead of failing opaquely", async () => {
    getEventMock.mockResolvedValue(null);
    const out = await updateCalendarEvent({
      eventId: "gone",
      summary: "New name",
      timeZone: IST,
    });
    expect(out).toContain("no longer exists");
    expect(updateEventMock).not.toHaveBeenCalled();
  });
});

describe("deleteCalendarEvent", () => {
  beforeEach(() => {
    configuredMock.mockReset();
    getEventMock.mockReset();
    deleteEventMock.mockReset();
    configuredMock.mockReturnValue(true);
  });

  it("names what it removed, so a wrong deletion is obvious", async () => {
    getEventMock.mockResolvedValue({
      id: "evt_1",
      summary: "Swimming",
      start: "2026-07-28T13:30:00.000Z",
      end: "2026-07-28T14:30:00.000Z",
      calendarId: "primary",
    });
    deleteEventMock.mockResolvedValue({ deleted: true, eventId: "evt_1" });

    const out = await deleteCalendarEvent({ eventId: "evt_1", timeZone: IST });

    expect(out).toContain('Deleted "Swimming"');
    expect(out).toContain("19:00");
    expect(deleteEventMock).toHaveBeenCalledWith({ eventId: "evt_1" });
  });

  it("does not call the API without an id, or for an event already gone", async () => {
    expect(await deleteCalendarEvent({ eventId: "", timeZone: IST })).toContain("needs its id");
    getEventMock.mockResolvedValue(null);
    expect(await deleteCalendarEvent({ eventId: "gone", timeZone: IST })).toContain(
      "no longer exists",
    );
    expect(deleteEventMock).not.toHaveBeenCalled();
  });

  it("explains itself when Calendar is not connected", async () => {
    configuredMock.mockReturnValue(false);
    expect(await deleteCalendarEvent({ eventId: "evt_1", timeZone: IST })).toContain(
      "not connected",
    );
    expect(getEventMock).not.toHaveBeenCalled();
  });
});
