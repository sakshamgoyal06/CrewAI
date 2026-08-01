import { beforeEach, describe, expect, it, vi } from "vitest";

const recordMock = vi.hoisted(() => vi.fn());
const listMock = vi.hoisted(() => vi.fn());
const statusMock = vi.hoisted(() => vi.fn());
const rescheduleMock = vi.hoisted(() => vi.fn());
const statsMock = vi.hoisted(() => vi.fn());
const getMock = vi.hoisted(() => vi.fn());
const deleteMock = vi.hoisted(() => vi.fn());
const missedMock = vi.hoisted(() => vi.fn());

vi.mock("../../events/eventsStore.js", () => ({
  recordMagnusEvent: recordMock,
  listMagnusEvents: listMock,
  updateMagnusEventStatus: statusMock,
  rescheduleMagnusEvent: rescheduleMock,
  listActivityStats: statsMock,
  getMagnusEvent: getMock,
  deleteMagnusEvent: deleteMock,
  markMissedMagnusEvents: missedMock,
}));

import {
  dropEvent,
  listEvents,
  planEvent,
  rescheduleEvent,
  setEventStatus,
  summariseActivity,
} from "./eventTool.js";

const USER = "00000000-0000-0000-0000-000000000001";
const TZ = "Asia/Kolkata";

type EventOverrides = Record<string, unknown>;

const event = (over: EventOverrides = {}): Record<string, unknown> => ({
  id: "evt-1",
  user_profile_id: USER,
  title: "AI session",
  details: null,
  pillar: "wisdom",
  kind: "event",
  status: "planned",
  time_zone: TZ,
  all_day: false,
  planned_start_at: "2026-08-01T15:30:00.000Z",
  planned_end_at: "2026-08-01T17:00:00.000Z",
  reschedule_count: 0,
  start_delay_minutes: null,
  actual_duration_minutes: null,
  quality_rating: null,
  outcome_note: null,
  original_planned_start_at: null,
  root_event_id: "evt-1",
  ...over,
});

beforeEach(() => {
  for (const m of [
    recordMock,
    listMock,
    statusMock,
    rescheduleMock,
    statsMock,
    getMock,
    deleteMock,
    missedMock,
  ]) {
    m.mockReset();
  }
});

describe("planEvent", () => {
  it("reads a bare local time as the user's wall clock", async () => {
    recordMock.mockResolvedValue({ ok: true, event: event() });

    const out = await planEvent({
      userProfileId: USER,
      timeZone: TZ,
      title: "AI session",
      pillar: "wisdom",
      startIso: "2026-08-01T21:00:00",
      endIso: "2026-08-01T22:30:00",
    });

    const arg = recordMock.mock.calls[0][0];
    expect(arg.plannedStartAt.toISOString()).toBe("2026-08-01T15:30:00.000Z");
    expect(arg.plannedEndAt.toISOString()).toBe("2026-08-01T17:00:00.000Z");
    expect(arg.status).toBe("planned");
    expect(out).toContain("Sat 1 Aug 21:00–22:30");
    expect(out).toContain("[id: evt-1]");
  });

  it("turns a duration into an end time", async () => {
    recordMock.mockResolvedValue({ ok: true, event: event() });
    await planEvent({
      userProfileId: USER,
      timeZone: TZ,
      title: "Gym",
      startIso: "2026-08-01T07:00:00",
      durationMinutes: 45,
    });
    expect(recordMock.mock.calls[0][0].plannedEndAt.toISOString()).toBe("2026-08-01T02:15:00.000Z");
  });

  it("records when something already done actually ran", async () => {
    recordMock.mockResolvedValue({ ok: true, event: event({ status: "done" }) });
    const out = await planEvent({
      userProfileId: USER,
      timeZone: TZ,
      title: "Walk",
      status: "done",
      startIso: "2026-08-01T18:00:00",
      durationMinutes: 30,
    });
    const arg = recordMock.mock.calls[0][0];
    expect(arg.startedAt.toISOString()).toBe("2026-08-01T12:30:00.000Z");
    expect(arg.endedAt.toISOString()).toBe("2026-08-01T13:00:00.000Z");
    expect(out).toContain("Logged as done");
  });

  it("keeps a backlog item with no time", async () => {
    recordMock.mockResolvedValue({
      ok: true,
      event: event({ planned_start_at: null, planned_end_at: null }),
    });
    const out = await planEvent({ userProfileId: USER, timeZone: TZ, title: "Read the tax docs" });
    expect(recordMock.mock.calls[0][0].plannedStartAt).toBeNull();
    expect(out).toContain("no time set");
  });

  it("refuses times it cannot read, and backwards ones", async () => {
    expect(await planEvent({ userProfileId: USER, timeZone: TZ, title: "X", startIso: "soon" }))
      .toContain("Could not read a time");
    expect(
      await planEvent({
        userProfileId: USER,
        timeZone: TZ,
        title: "X",
        startIso: "2026-08-01T10:00:00",
        endIso: "2026-08-01T09:00:00",
      }),
    ).toContain("ends before it starts");
    expect(recordMock).not.toHaveBeenCalled();
  });

  it("passes the failure on in plain words", async () => {
    recordMock.mockResolvedValue({ ok: false, error: "there is already an open event" });
    expect(await planEvent({ userProfileId: USER, timeZone: TZ, title: "Gym" })).toBe(
      "Could not log that: there is already an open event.",
    );
  });
});

describe("listEvents", () => {
  it("defaults to today in the user's zone", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-01T20:00:00.000Z")); // 01:30 on 2 Aug in Kolkata
    listMock.mockResolvedValue({ ok: true, events: [] });

    await listEvents({ userProfileId: USER, timeZone: TZ });

    const arg = listMock.mock.calls[0][0];
    expect(arg.from.toISOString()).toBe("2026-08-01T18:30:00.000Z");
    expect(arg.to.toISOString()).toBe("2026-08-02T18:30:00.000Z");
    vi.useRealTimers();
  });

  it("searches all of history when given a query", async () => {
    listMock.mockResolvedValue({ ok: true, events: [] });
    await listEvents({ userProfileId: USER, timeZone: TZ, query: "ai session" });
    const arg = listMock.mock.calls[0][0];
    expect(arg.from).toBeNull();
    expect(arg.to).toBeNull();
    expect(arg.query).toBe("ai session");
  });

  it("shows outcome, slippage and the id on each line", async () => {
    listMock.mockResolvedValue({
      ok: true,
      events: [
        event({
          status: "done",
          reschedule_count: 2,
          start_delay_minutes: 25,
          actual_duration_minutes: 55,
          quality_rating: 4,
          outcome_note: "Slow start",
        }),
      ],
    });

    const out = await listEvents({ userProfileId: USER, timeZone: TZ });
    expect(out).toContain("Sat 1 Aug 21:00–22:30 — AI session [wisdom]");
    expect(out).toContain("done, moved 2×, started 25m late, 55m long, rated 4/5");
    expect(out).toContain("note: Slow start");
    expect(out).toContain("[id: evt-1]");
  });

  it("says so when there is nothing", async () => {
    listMock.mockResolvedValue({ ok: true, events: [] });
    expect(await listEvents({ userProfileId: USER, timeZone: TZ })).toBe(
      "Nothing logged for that range.",
    );
  });
});

describe("setEventStatus", () => {
  it("records the outcome", async () => {
    statusMock.mockResolvedValue({
      ok: true,
      event: event({ status: "done", start_delay_minutes: 15 }),
    });
    const out = await setEventStatus({
      userProfileId: USER,
      timeZone: TZ,
      eventId: "evt-1",
      status: "done",
      note: "Finally shipped it",
    });
    expect(statusMock.mock.calls[0][0].outcomeNote).toBe("Finally shipped it");
    expect(out).toContain("is now done");
    expect(out).toContain("started 15m late");
  });

  it("sends a postponement to the right tool instead of faking it", async () => {
    const out = await setEventStatus({
      userProfileId: USER,
      timeZone: TZ,
      eventId: "evt-1",
      status: "postponed",
    });
    expect(out).toContain("reschedule it instead");
    expect(statusMock).not.toHaveBeenCalled();
  });

  it("needs an id it has actually read", async () => {
    expect(
      await setEventStatus({ userProfileId: USER, timeZone: TZ, eventId: " ", status: "done" }),
    ).toContain("Read the log first");
  });
});

describe("rescheduleEvent", () => {
  it("names the direction and both times", async () => {
    rescheduleMock.mockResolvedValue({
      ok: true,
      previous: event(),
      event: event({
        id: "evt-2",
        planned_start_at: "2026-08-01T17:30:00.000Z",
        planned_end_at: "2026-08-01T19:00:00.000Z",
        reschedule_count: 1,
      }),
    });

    const out = await rescheduleEvent({
      userProfileId: USER,
      timeZone: TZ,
      eventId: "evt-1",
      newStartIso: "2026-08-01T23:00:00",
      reason: "Dinner ran long",
    });

    expect(rescheduleMock.mock.calls[0][0].newStartAt.toISOString()).toBe(
      "2026-08-01T17:30:00.000Z",
    );
    expect(out).toContain('Postponed "AI session" from Sat 1 Aug 21:00–22:30 to Sat 1 Aug 23:00');
    expect(out).toContain("[id: evt-2]");
  });

  it("calls an earlier time a prepone, and counts the drift", async () => {
    rescheduleMock.mockResolvedValue({
      ok: true,
      previous: event({ planned_start_at: "2026-08-01T17:30:00.000Z", planned_end_at: null }),
      event: event({
        id: "evt-3",
        planned_start_at: "2026-08-01T15:30:00.000Z",
        planned_end_at: null,
        reschedule_count: 3,
        original_planned_start_at: "2026-07-30T15:30:00.000Z",
      }),
    });

    const out = await rescheduleEvent({
      userProfileId: USER,
      timeZone: TZ,
      eventId: "evt-2",
      newStartIso: "2026-08-01T21:00:00",
    });

    expect(out).toContain("Preponed");
    expect(out).toContain("3 moves since first planned for Thu 30 Jul 21:00");
  });

  it("reports why the move was refused", async () => {
    rescheduleMock.mockResolvedValue({ ok: false, error: "that event has already been moved once" });
    expect(
      await rescheduleEvent({
        userProfileId: USER,
        timeZone: TZ,
        eventId: "evt-1",
        newStartIso: "2026-08-02T09:00:00",
      }),
    ).toBe("Could not move that: that event has already been moved once.");
  });
});

describe("dropEvent", () => {
  it("checks the entry exists before removing it", async () => {
    getMock.mockResolvedValue(null);
    expect(await dropEvent({ userProfileId: USER, timeZone: TZ, eventId: "evt-9" })).toBe(
      "No such entry in the log.",
    );
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it("names what it removed", async () => {
    getMock.mockResolvedValue(event());
    deleteMock.mockResolvedValue({ ok: true });
    expect(await dropEvent({ userProfileId: USER, timeZone: TZ, eventId: "evt-1" })).toContain(
      'Removed "AI session"',
    );
  });
});

describe("summariseActivity", () => {
  it("reads a pattern out of the counts", async () => {
    statsMock.mockResolvedValue([
      {
        sample_title: "AI session",
        pillar: "wisdom",
        times_planned: 12,
        times_done: 7,
        times_missed: 2,
        times_skipped: 0,
        times_cancelled: 0,
        times_postponed: 3,
        times_preponed: 1,
        avg_start_delay_minutes: 18,
        avg_actual_duration_minutes: 62,
        avg_quality_rating: 3.8,
        usual_local_time: "21:00:00",
        usual_local_dow: 6,
      },
    ]);

    const out = await summariseActivity({ userProfileId: USER });
    expect(out).toContain("AI session [wisdom]");
    expect(out).toContain("7 done, 2 missed, 3 postponed, 1 pulled earlier");
    expect(out).toContain("58% follow-through");
    expect(out).toContain("usually 21:00 on Sat");
    expect(out).toContain("typically starts 18m late");
    expect(out).toContain("~62m each");
  });

  it("normalises an activity name into the stored key", async () => {
    statsMock.mockResolvedValue([]);
    await summariseActivity({ userProfileId: USER, activityKey: "AI Session" });
    expect(statsMock.mock.calls[0][0].activityKey).toBe("ai_session");
  });

  it("admits when there is nothing yet", async () => {
    statsMock.mockResolvedValue([]);
    expect(await summariseActivity({ userProfileId: USER })).toBe(
      "Nothing in the log to summarise yet.",
    );
  });
});
