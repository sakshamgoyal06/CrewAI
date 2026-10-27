import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./subscriptions/store.js", () => ({
  createCustomReminder: vi.fn(),
  createRecurringCustomReminder: vi.fn(),
  createWeeklyCustomReminder: vi.fn(),
  createIntervalCustomReminder: vi.fn(),
  updateCustomReminder: vi.fn(),
  snoozeCustomReminder: vi.fn(),
  deleteSubscription: vi.fn(),
  listEnabledCustomReminders: vi.fn(),
  replaceCustomReminderSchedule: vi.fn(),
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
  createIntervalCustomReminder,
  createRecurringCustomReminder,
  createWeeklyCustomReminder,
  deleteSubscription,
  listEnabledCustomReminders,
  replaceCustomReminderSchedule,
  snoozeCustomReminder,
} from "./subscriptions/store.js";

describe("manageReminders", () => {
  beforeEach(() => {
    vi.mocked(listUpcomingReminders).mockResolvedValue([]);
    vi.mocked(listEnabledCustomReminders).mockResolvedValue([]);
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

const CORIANDER = "💧 Change the water in your coriander plant!";

function standaloneRow(id: string, title: string, recurring = true) {
  return {
    kind: "standalone" as const,
    id,
    title,
    at: null,
    scheduleLabel: "Daily at 09:00 local",
    recurring,
  };
}

function enabledReminder(id: string, message: string) {
  return {
    id,
    userProfileId: "u1",
    kind: "custom_reminder",
    enabled: true,
    triggerType: "recurring" as const,
    schedule: { type: "recurring_local", localHour: 9 },
    config: { message },
    userInstruction: message,
    source: "user_chat" as const,
    capBucket: "user_asked" as const,
    cooldownHours: null,
    lastSentAt: null,
    nextFireAt: null,
    createdAt: "",
    updatedAt: "",
  };
}

describe("manageReminders — interval cadence (B-001)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listUpcomingReminders).mockResolvedValue([]);
    vi.mocked(listEnabledCustomReminders).mockResolvedValue([]);
  });

  it("stores 'every 2 days' as one interval reminder, not a daily one", async () => {
    vi.mocked(createIntervalCustomReminder).mockResolvedValue({ ok: true, data: {} as never });

    const out = await manageReminders({
      userProfileId: "u1",
      timezone: "Asia/Kolkata",
      action: "create_recurring",
      message: CORIANDER,
      local_hour: 9,
      interval_days: 2,
    });

    expect(createIntervalCustomReminder).toHaveBeenCalledWith(
      expect.objectContaining({ intervalDays: 2, localHour: 9 }),
    );
    expect(createRecurringCustomReminder).not.toHaveBeenCalled();
    expect(out).toContain("every other day");
  });

  it("carries an until date onto the schedule so the run is bounded", async () => {
    vi.mocked(createIntervalCustomReminder).mockResolvedValue({ ok: true, data: {} as never });

    const out = await manageReminders({
      userProfileId: "u1",
      timezone: "Asia/Kolkata",
      action: "create_recurring",
      message: CORIANDER,
      local_hour: 9,
      interval_days: 2,
      until: "2026-08-30",
    });

    expect(createIntervalCustomReminder).toHaveBeenCalledWith(
      expect.objectContaining({ until: "2026-08-30" }),
    );
    expect(out).toContain("until 2026-08-30");
  });

  it("sets until on a plain daily reminder too", async () => {
    vi.mocked(createRecurringCustomReminder).mockResolvedValue({ ok: true, data: {} as never });

    await manageReminders({
      userProfileId: "u1",
      timezone: "Asia/Kolkata",
      action: "create_recurring",
      message: "Take duphalac",
      local_hour: 21,
      until: "2026-09-20",
    });

    expect(createRecurringCustomReminder).toHaveBeenCalledWith(
      expect.objectContaining({ until: "2026-09-20" }),
    );
  });

  it("rejects an unparseable until date instead of silently ignoring it", async () => {
    const out = await manageReminders({
      userProfileId: "u1",
      timezone: "Asia/Kolkata",
      action: "create_recurring",
      message: "Water plants",
      local_hour: 9,
      until: "whenever",
    });

    expect(out).toContain("Could not parse until date");
    expect(createRecurringCustomReminder).not.toHaveBeenCalled();
  });
});

describe("manageReminders — replace on correct (B-001)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listUpcomingReminders).mockResolvedValue([]);
  });

  it("updates the existing reminder rather than stacking a duplicate", async () => {
    vi.mocked(listEnabledCustomReminders).mockResolvedValue([
      enabledReminder("sub-1", CORIANDER) as never,
    ]);
    vi.mocked(replaceCustomReminderSchedule).mockResolvedValue({ ok: true, data: {} as never });

    const out = await manageReminders({
      userProfileId: "u1",
      timezone: "Asia/Kolkata",
      action: "create_recurring",
      message: "Change the water in your coriander plant",
      local_hour: 9,
      interval_days: 2,
    });

    expect(replaceCustomReminderSchedule).toHaveBeenCalledWith(
      expect.objectContaining({ subscriptionId: "sub-1" }),
    );
    expect(createIntervalCustomReminder).not.toHaveBeenCalled();
    expect(out).toContain("no duplicate created");
  });

  it("still creates a new reminder when nothing similar exists", async () => {
    vi.mocked(listEnabledCustomReminders).mockResolvedValue([
      enabledReminder("sub-1", "Call mom 📞") as never,
    ]);
    vi.mocked(createIntervalCustomReminder).mockResolvedValue({ ok: true, data: {} as never });

    await manageReminders({
      userProfileId: "u1",
      timezone: "Asia/Kolkata",
      action: "create_recurring",
      message: CORIANDER,
      local_hour: 9,
      interval_days: 2,
    });

    expect(createIntervalCustomReminder).toHaveBeenCalled();
    expect(replaceCustomReminderSchedule).not.toHaveBeenCalled();
  });

  it("retimes an existing one-shot instead of adding a second copy", async () => {
    vi.mocked(listEnabledCustomReminders).mockResolvedValue([
      enabledReminder("sub-7", "Call mom 📞") as never,
    ]);
    vi.mocked(replaceCustomReminderSchedule).mockResolvedValue({ ok: true, data: {} as never });

    const out = await manageReminders({
      userProfileId: "u1",
      timezone: "Asia/Kolkata",
      action: "create",
      message: "Call mom",
      at: "tomorrow 8pm",
    });

    expect(replaceCustomReminderSchedule).toHaveBeenCalledWith(
      expect.objectContaining({ subscriptionId: "sub-7" }),
    );
    expect(createCustomReminder).not.toHaveBeenCalled();
    expect(out).toContain("no duplicate created");
  });
});

describe("manageReminders — cancel actually cancels (B-005)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listEnabledCustomReminders).mockResolvedValue([]);
  });

  it("cancels every duplicate copy of one reminder", async () => {
    vi.mocked(listUpcomingReminders).mockResolvedValue([
      standaloneRow("sub-a", CORIANDER),
      standaloneRow("sub-b", CORIANDER),
    ]);
    vi.mocked(deleteSubscription).mockResolvedValue({ ok: true, data: { deleted: true } });

    const out = await manageReminders({
      userProfileId: "u1",
      timezone: "Asia/Kolkata",
      action: "cancel",
      query: "Cancel reminders for coriander water change",
    });

    expect(deleteSubscription).toHaveBeenCalledTimes(2);
    expect(out).toContain("will not fire again");
    expect(out).toContain("2 duplicate copies");
  });

  it("matches the second production phrasing", async () => {
    vi.mocked(listUpcomingReminders).mockResolvedValue([standaloneRow("sub-a", CORIANDER)]);
    vi.mocked(deleteSubscription).mockResolvedValue({ ok: true, data: { deleted: true } });

    const out = await manageReminders({
      userProfileId: "u1",
      timezone: "Asia/Kolkata",
      action: "cancel",
      query: "water coriander",
    });

    expect(out).toContain("will not fire again");
  });

  it("asks which one only when the matches are genuinely different reminders", async () => {
    vi.mocked(listUpcomingReminders).mockResolvedValue([
      standaloneRow("sub-a", "Water the coriander plant"),
      standaloneRow("sub-b", "Water the tulsi plant"),
    ]);

    const out = await manageReminders({
      userProfileId: "u1",
      timezone: "Asia/Kolkata",
      action: "cancel",
      query: "water plant",
    });

    expect(out).toContain("say which one");
    expect(deleteSubscription).not.toHaveBeenCalled();
  });
});
