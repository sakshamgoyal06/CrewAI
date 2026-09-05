import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./subscriptions/store.js", () => ({
  createCustomReminder: vi.fn(),
  createRecurringCustomReminder: vi.fn(),
  createWeeklyCustomReminder: vi.fn(),
  updateCustomReminder: vi.fn(),
  snoozeCustomReminder: vi.fn(),
  deleteSubscription: vi.fn(),
}));

vi.mock("./reminderStore.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./reminderStore.js")>();
  return {
    ...actual,
    listUpcomingReminders: vi.fn(),
  };
});

vi.mock("../events/eventStore.js", () => ({
  updateEvent: vi.fn(),
}));

import { updateEvent } from "../events/eventStore.js";
import { manageReminders } from "./manageRemindersTool.js";
import { listUpcomingReminders } from "./reminderStore.js";
import {
  createCustomReminder,
  createWeeklyCustomReminder,
  deleteSubscription,
  snoozeCustomReminder,
} from "./subscriptions/store.js";

describe("manageReminders", () => {
  beforeEach(() => {
    vi.mocked(listUpcomingReminders).mockResolvedValue([]);
  });

  it("lists reminders", async () => {
    vi.mocked(listUpcomingReminders).mockResolvedValue([
      {
        kind: "standalone",
        id: "abc-123-def",
        title: "Call mom",
        at: new Date("2026-08-08T14:30:00.000Z"),
        scheduleLabel: null,
        recurring: false,
      },
    ]);

    const out = await manageReminders({
      userProfileId: "u1",
      timezone: "UTC",
      action: "list",
    });
    expect(out).toContain("Call mom");
    expect(out).toContain("standalone:abc-123");
  });

  it("creates one-shot reminder", async () => {
    const futureAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    vi.mocked(createCustomReminder).mockResolvedValue({
      ok: true,
      data: {
        id: "r1",
        userProfileId: "u1",
        kind: "custom_reminder",
        enabled: true,
        triggerType: "one_shot",
        schedule: { type: "one_shot", at: futureAt.toISOString() },
        config: { message: "Stretch" },
        userInstruction: "Stretch",
        source: "user_chat",
        capBucket: "user_asked",
        cooldownHours: null,
        lastSentAt: null,
        nextFireAt: futureAt.toISOString(),
        createdAt: "",
        updatedAt: "",
      },
    });

    const out = await manageReminders({
      userProfileId: "u1",
      timezone: "Asia/Kolkata",
      action: "create",
      message: "Stretch",
      at: "tomorrow 8pm",
    });
    expect(out).toContain("Reminder set");
    expect(createCustomReminder).toHaveBeenCalled();
  });

  it("creates weekly recurring reminder", async () => {
    vi.mocked(createWeeklyCustomReminder).mockResolvedValue({
      ok: true,
      data: {
        id: "w1",
        userProfileId: "u1",
        kind: "custom_reminder",
        enabled: true,
        triggerType: "recurring",
        schedule: { type: "weekly_local", daysOfWeek: [1, 3, 5], localHour: 19 },
        config: { message: "AI session" },
        userInstruction: "AI session",
        source: "user_chat",
        capBucket: "user_asked",
        cooldownHours: null,
        lastSentAt: null,
        nextFireAt: null,
        createdAt: "",
        updatedAt: "",
      },
    });

    const out = await manageReminders({
      userProfileId: "u1",
      timezone: "UTC",
      action: "create_recurring",
      message: "AI session",
      local_hour: 19,
      days_of_week: "mon,wed,fri",
    });
    expect(out).toContain("Weekly reminder");
    expect(createWeeklyCustomReminder).toHaveBeenCalled();
  });

  it("snoozes standalone reminder", async () => {
    vi.mocked(listUpcomingReminders).mockResolvedValue([
      {
        kind: "standalone",
        id: "sub-1",
        title: "Buy tomatoes",
        at: new Date("2026-08-08T06:00:00.000Z"),
        scheduleLabel: null,
        recurring: false,
      },
    ]);
    vi.mocked(snoozeCustomReminder).mockResolvedValue({
      ok: true,
      data: {
        id: "sub-1",
        userProfileId: "u1",
        kind: "custom_reminder",
        enabled: true,
        triggerType: "one_shot",
        schedule: { type: "one_shot", at: "" },
        config: {},
        userInstruction: null,
        source: "user_chat",
        capBucket: "user_asked",
        cooldownHours: null,
        lastSentAt: null,
        nextFireAt: null,
        createdAt: "",
        updatedAt: "",
      },
    });

    const out = await manageReminders({
      userProfileId: "u1",
      timezone: "UTC",
      action: "snooze",
      query: "tomatoes",
      new_at: "in 2 hours",
    });
    expect(out).toContain("snoozed");
    expect(snoozeCustomReminder).toHaveBeenCalled();
  });

  it("cancels event-linked reminder", async () => {
    vi.mocked(listUpcomingReminders).mockResolvedValue([
      {
        kind: "event",
        id: "ev-1",
        eventId: "ev-1",
        title: "Bike service",
        at: new Date("2026-08-10T04:00:00.000Z"),
        scheduleLabel: null,
        recurring: false,
      },
    ]);
    vi.mocked(updateEvent).mockResolvedValue({
      ok: true,
      data: {
        id: "ev-1",
        title: "Bike service",
      } as never,
    });

    const out = await manageReminders({
      userProfileId: "u1",
      timezone: "UTC",
      action: "cancel",
      query: "bike",
    });
    expect(out).toContain("Cancelled commitment reminder");
    expect(updateEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: "ev-1", remindAt: null }),
    );
  });

  it("cancels standalone reminder", async () => {
    vi.mocked(listUpcomingReminders).mockResolvedValue([
      {
        kind: "standalone",
        id: "sub-9",
        title: "Call mom",
        at: new Date("2026-08-08T14:30:00.000Z"),
        scheduleLabel: null,
        recurring: false,
      },
    ]);
    vi.mocked(deleteSubscription).mockResolvedValue({ ok: true, data: { deleted: true } });

    const out = await manageReminders({
      userProfileId: "u1",
      timezone: "UTC",
      action: "cancel",
      query: "mom",
    });
    expect(out).toContain('Cancelled reminder "Call mom"');
  });
});
