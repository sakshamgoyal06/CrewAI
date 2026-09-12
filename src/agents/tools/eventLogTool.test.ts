import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createEvent = vi.hoisted(() => vi.fn());

vi.mock("../../events/eventStore.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../events/eventStore.js")>();
  return { ...actual, createEvent };
});

import { logEvent } from "./eventLogTool.js";

const NOW = new Date("2026-09-12T04:00:00.000Z");

function savedEvent(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    data: {
      duplicate: false,
      event: {
        id: "ev-1",
        title: "Gym",
        status: "planned",
        planned_start_at: "2026-09-12T12:00:00.000Z",
        planned_end_at: null,
        all_day: false,
        activity_key: "gym",
        pillar: "health",
        ...overrides,
      },
    },
  };
}

describe("logEvent — commitments get a reminder by default", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    delete process.env.MAGNUS_DEFAULT_EVENT_REMINDER_LEAD_MINUTES;
    createEvent.mockResolvedValue(savedEvent());
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.MAGNUS_DEFAULT_EVENT_REMINDER_LEAD_MINUTES;
  });

  // remind_at was almost never set, so the event-reminder job had nothing to send.
  it("sets remind_at ahead of a future planned start", async () => {
    const out = await logEvent({
      userProfileId: "u1",
      timeZone: "UTC",
      title: "Gym",
      start: "2026-09-12T12:00",
    });

    const arg = createEvent.mock.calls[0]?.[0] as { remindAt: Date | null };
    expect(arg.remindAt?.toISOString()).toBe("2026-09-12T11:30:00.000Z");
    expect(out).toContain("I'll nudge you at");
  });

  it("never overrides a reminder the user asked for", async () => {
    await logEvent({
      userProfileId: "u1",
      timeZone: "UTC",
      title: "Gym",
      start: "2026-09-12T12:00",
      remindAt: "2026-09-12T08:00",
    });

    const arg = createEvent.mock.calls[0]?.[0] as { remindAt: Date | null };
    expect(arg.remindAt?.toISOString()).toBe("2026-09-12T08:00:00.000Z");
  });

  it("honours a configured lead time, and 0 opts out", async () => {
    process.env.MAGNUS_DEFAULT_EVENT_REMINDER_LEAD_MINUTES = "90";
    await logEvent({
      userProfileId: "u1",
      timeZone: "UTC",
      title: "Gym",
      start: "2026-09-12T12:00",
    });
    expect((createEvent.mock.calls[0]?.[0] as { remindAt: Date | null }).remindAt?.toISOString()).toBe(
      "2026-09-12T10:30:00.000Z",
    );

    createEvent.mockClear();
    process.env.MAGNUS_DEFAULT_EVENT_REMINDER_LEAD_MINUTES = "0";
    await logEvent({
      userProfileId: "u1",
      timeZone: "UTC",
      title: "Gym",
      start: "2026-09-12T12:00",
    });
    expect((createEvent.mock.calls[0]?.[0] as { remindAt: Date | null }).remindAt).toBeNull();
  });

  it("does not schedule a reminder in the past", async () => {
    await logEvent({
      userProfileId: "u1",
      timeZone: "UTC",
      title: "Gym",
      start: "2026-09-12T04:10",
    });

    expect((createEvent.mock.calls[0]?.[0] as { remindAt: Date | null }).remindAt).toBeNull();
  });

  it("leaves after-the-fact and untimed entries alone", async () => {
    await logEvent({
      userProfileId: "u1",
      timeZone: "UTC",
      title: "Gym",
      start: "2026-09-12T12:00",
      status: "done",
    });
    expect((createEvent.mock.calls[0]?.[0] as { remindAt: Date | null }).remindAt).toBeNull();

    createEvent.mockClear();
    await logEvent({ userProfileId: "u1", timeZone: "UTC", title: "Fix the tap" });
    expect((createEvent.mock.calls[0]?.[0] as { remindAt: Date | null }).remindAt).toBeNull();

    createEvent.mockClear();
    await logEvent({
      userProfileId: "u1",
      timeZone: "UTC",
      title: "Holiday",
      start: "2026-09-20",
    });
    expect((createEvent.mock.calls[0]?.[0] as { remindAt: Date | null }).remindAt).toBeNull();
  });
});
