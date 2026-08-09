import { beforeEach, describe, expect, it, vi } from "vitest";

const readCalendarMock = vi.fn();
const listEventsMock = vi.fn();
const getPlanEntriesMock = vi.fn();

vi.mock("../../tools/calendarTool.js", () => ({
  readCalendarEvents: (...args: unknown[]) => readCalendarMock(...args),
}));

vi.mock("../../tools/eventLogTool.js", () => ({
  listEventsTool: (...args: unknown[]) => listEventsMock(...args),
}));

vi.mock("../../../nutrition/store/mealPlanStore.js", () => ({
  getPlanEntriesForDate: (...args: unknown[]) => getPlanEntriesMock(...args),
  formatPlanDay: (entries: unknown[], label: string, localDate: string) =>
    entries.length
      ? `${label} (${localDate}): ${(entries as { title: string }[]).map((e) => e.title).join(", ")}`
      : `No meals planned for ${label.toLowerCase()}.`,
}));

import { executeDayOverviewCapability } from "./dayOverview.js";

function ctx(raw: string) {
  return {
    userProfileId: "u1",
    telegramUserId: "t1",
    timezone: "Asia/Kolkata",
    rawMessage: raw,
    intent: "GENERAL" as const,
  };
}

describe("executeDayOverviewCapability", () => {
  beforeEach(() => {
    readCalendarMock.mockReset();
    listEventsMock.mockReset();
    getPlanEntriesMock.mockReset();
    readCalendarMock.mockResolvedValue("- 09:00 Standup\n- 13:00 Lunch with Alex");
    listEventsMock.mockResolvedValue("- Gym (planned)");
    getPlanEntriesMock.mockResolvedValue([
      { local_date: "2026-08-10", meal_slot: "breakfast", title: "Oats" },
    ]);
  });

  it("loads calendar, commitments, and meals for tomorrow", async () => {
    const out = await executeDayOverviewCapability(ctx("What does my entire day look like tomorrow?"), {
      date_hint: "tomorrow",
    });

    expect(out.metadata?.day_overview).toBe(true);
    expect(readCalendarMock).toHaveBeenCalled();
    expect(listEventsMock).toHaveBeenCalled();
    expect(getPlanEntriesMock).toHaveBeenCalled();
    expect(out.text).toMatch(/Calendar/);
    expect(out.text).toMatch(/Standup/);
    expect(out.text).toMatch(/Commitments/);
    expect(out.text).toMatch(/Gym/);
    expect(out.text).toMatch(/Meals/);
    expect(out.text).toMatch(/Oats/);
  });
});
