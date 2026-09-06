import { beforeEach, describe, expect, it, vi } from "vitest";

const readCalendarMock = vi.fn();
const listEventsMock = vi.fn();
const listRemindersMock = vi.fn();

vi.mock("../agents/tools/calendarTool.js", () => ({
  readCalendarEvents: (...args: unknown[]) => readCalendarMock(...args),
}));

vi.mock("../agents/tools/eventLogTool.js", () => ({
  listEventsTool: (...args: unknown[]) => listEventsMock(...args),
}));

vi.mock("../proactive/reminderStore.js", () => ({
  listUpcomingReminders: (...args: unknown[]) => listRemindersMock(...args),
  formatReminderList: () => "- 09:00 Gym reminder",
}));

vi.mock("../nutrition/store/mealPlanStore.js", () => ({
  getPlanEntriesForDate: vi.fn().mockResolvedValue([]),
  formatPlanDay: () => "",
}));

vi.mock("../nutrition/store/mealHistoryStore.js", () => ({
  getSessionsForLocalDate: vi.fn().mockResolvedValue([]),
}));

vi.mock("../meals/mealDaySummary.js", () => ({
  sumMealLogsForDay: vi.fn().mockResolvedValue({
    date: "2026-08-12",
    calories: 0,
    protein_g: 0,
    carbs_g: 0,
    fat_g: 0,
  }),
}));

import { buildDayContext, formatDayContextSections } from "./buildDayContext.js";

describe("buildDayContext", () => {
  beforeEach(() => {
    readCalendarMock.mockReset();
    listEventsMock.mockReset();
    listRemindersMock.mockReset();
    readCalendarMock.mockResolvedValue("- 10:00 Morning swim");
    listEventsMock.mockResolvedValue("- Gym (planned)");
    listRemindersMock.mockResolvedValue([
      {
        kind: "standalone",
        id: "r1",
        title: "Gym reminder",
        at: new Date("2026-08-12T09:00:00.000Z"),
        scheduleLabel: null,
        recurring: false,
      },
    ]);
  });

  it("loads calendar, commitments, and reminders for a day", async () => {
    const ctx = await buildDayContext({
      userProfileId: "u1",
      timezone: "UTC",
      localDate: "2026-08-12",
      label: "Today",
      offsetDays: 0,
      includeMeals: false,
    });

    expect(readCalendarMock).toHaveBeenCalled();
    expect(listEventsMock).toHaveBeenCalled();
    expect(ctx.calendarText).toContain("Morning swim");
    expect(ctx.eventLogText).toContain("Gym");
    expect(ctx.reminders).toHaveLength(1);

    const text = formatDayContextSections(ctx, { includeMeals: false });
    expect(text).toMatch(/Calendar/);
    expect(text).toMatch(/Reminders/);
    expect(text).not.toMatch(/Meals — logged/);
  });
});
