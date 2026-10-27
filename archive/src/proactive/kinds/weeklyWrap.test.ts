import { describe, expect, it, vi } from "vitest";

vi.mock("../rhythm/weekSummary.js", () => ({
  buildWeekRhythmSummary: vi.fn(async () => ({
    fromDate: "2026-08-01",
    toDate: "2026-08-07",
    checkinCount: 5,
    joyTrend: "up",
    activityStatsText: "gym: 5 done",
    nutritionText: "avg 1900 kcal",
    northStar: "Build",
    weeklyGoalsText: "- Goal A",
    text: "Week summary stub",
  })),
}));

import { emptyMealProactiveSnapshot } from "../../nutrition/mealProactiveSignals.js";
import { weeklyWrapHandler } from "./weeklyWrap.js";
import type { ProactiveKindContext } from "./types.js";

function ctx(overrides: Partial<ProactiveKindContext> = {}): ProactiveKindContext {
  return {
    now: new Date("2026-08-07T18:05:00.000Z"),
    userProfileId: "u1",
    telegramChatId: "123",
    timezone: "UTC",
    subscription: {
      id: "s1",
      userProfileId: "u1",
      kind: "weekly_wrap",
      enabled: true,
      triggerType: "recurring",
      schedule: { type: "recurring_local", localHour: 18, windowMinutes: 20 },
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
      now: new Date("2026-08-07T18:05:00.000Z"),
      timezone: "UTC",
      local: { hour: 18, minute: 5, dateKey: "2026-08-07" },
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

describe("weeklyWrapHandler", () => {
  it("evaluates true on Friday in window", async () => {
    const result = await weeklyWrapHandler.evaluate(ctx());
    expect(result.candidate).toBe(true);
  });

  it("evaluates false on Monday", async () => {
    const result = await weeklyWrapHandler.evaluate(
      ctx({
        now: new Date("2026-08-03T18:05:00.000Z"),
        signals: {
          ...ctx().signals,
          now: new Date("2026-08-03T18:05:00.000Z"),
          local: { hour: 18, minute: 5, dateKey: "2026-08-03" },
        },
      }),
    );
    expect(result.candidate).toBe(false);
    expect(result.reason).toBe("not_friday");
  });
});
