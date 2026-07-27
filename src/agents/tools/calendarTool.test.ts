import { beforeEach, describe, expect, it, vi } from "vitest";

const configuredMock = vi.hoisted(() => vi.fn());
const listEventsMock = vi.hoisted(() => vi.fn());
const createEventMock = vi.hoisted(() => vi.fn());

vi.mock("../../integrations/googleCalendar/auth.js", () => ({
  googleCalendarConfigured: configuredMock,
}));

vi.mock("../../integrations/googleCalendar/operations.js", () => ({
  listEvents: listEventsMock,
  createEvent: createEventMock,
}));

import { createCalendarEvent, readCalendarEvents } from "./calendarTool.js";

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
    expect(out).toContain("GOOGLE_CALENDAR_REFRESH_TOKEN");
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
