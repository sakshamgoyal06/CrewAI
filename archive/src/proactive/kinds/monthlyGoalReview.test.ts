import { describe, expect, it, vi } from "vitest";

vi.mock("../rhythm/monthSummary.js", () => ({
  buildMonthRhythmSummary: vi.fn(async () => ({
    monthKey: "2026-08",
    text: "Month summary stub",
  })),
}));

import { emptyMealProactiveSnapshot } from "../../nutrition/mealProactiveSignals.js";
import { monthlyGoalReviewHandler } from "./monthlyGoalReview.js";
import type { ProactiveKindContext } from "./types.js";

function ctx(overrides: Partial<ProactiveKindContext> = {}): ProactiveKindContext {
  return {
    now: new Date("2026-08-01T10:05:00.000Z"),
    userProfileId: "u1",
    telegramChatId: "123",
    timezone: "UTC",
    subscription: {
      id: "s1",
      userProfileId: "u1",
      kind: "monthly_goal_review",
      enabled: true,
      triggerType: "recurring",
      schedule: { type: "recurring_local", localHour: 10, windowMinutes: 30 },
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
      now: new Date("2026-08-01T10:05:00.000Z"),
      timezone: "UTC",
      local: { hour: 10, minute: 5, dateKey: "2026-08-01" },
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

describe("monthlyGoalReviewHandler", () => {
  it("evaluates true on first of month in window", async () => {
    const result = await monthlyGoalReviewHandler.evaluate(ctx());
    expect(result.candidate).toBe(true);
  });

  it("evaluates false mid-month", async () => {
    const result = await monthlyGoalReviewHandler.evaluate(
      ctx({
        now: new Date("2026-08-15T10:05:00.000Z"),
        signals: {
          ...ctx().signals,
          now: new Date("2026-08-15T10:05:00.000Z"),
          local: { hour: 10, minute: 5, dateKey: "2026-08-15" },
        },
      }),
    );
    expect(result.candidate).toBe(false);
    expect(result.reason).toBe("not_first_of_month");
  });
});
