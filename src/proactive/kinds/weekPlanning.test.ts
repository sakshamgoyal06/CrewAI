import { describe, expect, it, vi } from "vitest";

vi.mock("../rhythm/weekSummary.js", () => ({
  buildWeekRhythmSummary: vi.fn(async () => ({
    fromDate: "2026-07-28",
    toDate: "2026-08-03",
    checkinCount: 4,
    joyTrend: "steady",
    activityStatsText: "gym: 4 done",
    nutritionText: null,
    northStar: "Build",
    weeklyGoalsText: "- Goal A",
    text: "Week summary stub",
  })),
}));

import { emptyMealProactiveSnapshot } from "../../nutrition/mealProactiveSignals.js";
import { weekPlanningHandler } from "./weekPlanning.js";
import type { ProactiveKindContext } from "./types.js";

function ctx(overrides: Partial<ProactiveKindContext> = {}): ProactiveKindContext {
  return {
    now: new Date("2026-08-03T08:05:00.000Z"),
    userProfileId: "u1",
    telegramChatId: "123",
    timezone: "UTC",
    subscription: {
      id: "s1",
      userProfileId: "u1",
      kind: "week_planning",
      enabled: true,
      triggerType: "recurring",
      schedule: { type: "recurring_local", localHour: 8, windowMinutes: 20 },
      config: {},
      userInstruction: null,
      source: "system_default",
      capBucket: "scheduled",
      cooldownHours: null,
      lastSentAt: null,
      nextFireAt: null,
      createdAt: "",
      updatedAt: "",
    },
    signals: {
      now: new Date("2026-08-03T08:05:00.000Z"),
      timezone: "UTC",
      local: { hour: 8, minute: 5, dateKey: "2026-08-03" },
      hasCheckinToday: false,
      hevyConnected: false,
      gymPlannedToday: false,
      workoutLoggedToday: false,
      recentUserChatSnippet: "",
      userGraphSummary: "",
      weeklyScheduleExcerpt: "",
      programWatchExcerpt: "",
      meals: emptyMealProactiveSnapshot(),
    },
    ...overrides,
  };
}

describe("weekPlanningHandler", () => {
  it("evaluates true on Monday in window", async () => {
    const result = await weekPlanningHandler.evaluate(ctx());
    expect(result.candidate).toBe(true);
  });

  it("evaluates false on Tuesday", async () => {
    const result = await weekPlanningHandler.evaluate(
      ctx({
        now: new Date("2026-08-04T08:05:00.000Z"),
        signals: {
          ...ctx().signals,
          now: new Date("2026-08-04T08:05:00.000Z"),
          local: { hour: 8, minute: 5, dateKey: "2026-08-04" },
        },
      }),
    );
    expect(result.candidate).toBe(false);
    expect(result.reason).toBe("not_monday");
  });
});
