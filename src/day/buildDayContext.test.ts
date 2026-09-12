import { beforeEach, describe, expect, it, vi } from "vitest";

const readCalendarMock = vi.fn();
const listEventsMock = vi.fn();
const listRemindersMock = vi.fn();
const fetchListBySlugMock = vi.fn();
const queryListItemsMock = vi.fn();

vi.mock("../lists/listStore.js", () => ({
  fetchListBySlug: (...args: unknown[]) => fetchListBySlugMock(...args),
  queryListItems: (...args: unknown[]) => queryListItemsMock(...args),
}));

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
    fetchListBySlugMock.mockReset();
    queryListItemsMock.mockReset();
    fetchListBySlugMock.mockResolvedValue({
      ok: true,
      data: { id: "list-tasks", slug: "tasks", open_statuses: ["Queued"] },
    });
    queryListItemsMock.mockResolvedValue({
      ok: true,
      data: [
        { title: "Renew passport", priority: "Low", status: "Queued" },
        { title: "Pay the electricity bill", priority: "High", status: "Queued" },
        { title: "Reply to Ananya", priority: null, status: "Queued" },
      ],
    });
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

  // "What does my day look like" has to include what the user actually has to do.
  it("includes open todos, highest priority first", async () => {
    const ctx = await buildDayContext({
      userProfileId: "u1",
      timezone: "UTC",
      localDate: "2026-08-12",
      label: "Today",
      offsetDays: 0,
      includeMeals: false,
    });

    expect(ctx.todos.map((t) => t.title)).toEqual([
      "Pay the electricity bill",
      "Renew passport",
      "Reply to Ananya",
    ]);
    const text = formatDayContextSections(ctx, { includeMeals: false });
    expect(text).toContain("Open todos");
    expect(text).toContain("Pay the electricity bill (High)");
  });

  it("says the list is clear rather than hiding the section", async () => {
    queryListItemsMock.mockResolvedValue({ ok: true, data: [] });

    const ctx = await buildDayContext({
      userProfileId: "u1",
      timezone: "UTC",
      localDate: "2026-08-12",
      label: "Today",
      offsetDays: 0,
      includeMeals: false,
    });

    expect(ctx.todos).toEqual([]);
    expect(formatDayContextSections(ctx, { includeMeals: false })).toContain(
      "Nothing open on your tasks list.",
    );
  });

  it("leaves undated todos off a retrospective day", async () => {
    const ctx = await buildDayContext({
      userProfileId: "u1",
      timezone: "UTC",
      localDate: "2026-08-11",
      label: "Yesterday",
      offsetDays: -1,
      includeMeals: false,
    });

    expect(queryListItemsMock).not.toHaveBeenCalled();
    expect(ctx.todos).toEqual([]);
    expect(formatDayContextSections(ctx, { includeMeals: false })).not.toContain("Open todos");
  });
});
