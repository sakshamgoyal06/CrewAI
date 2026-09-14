import { describe, expect, it, vi } from "vitest";

vi.mock("../../nutrition/analytics/weeklyNutritionSummary.js", () => ({
  loadWeeklyNutritionSummary: vi.fn(),
  formatWeeklyNutritionSummary: vi.fn(() => "week summary text"),
}));

vi.mock("../llm/gateAndCompose.js", () => ({
  gateAndCompose: vi.fn(),
}));

import { loadWeeklyNutritionSummary } from "../../nutrition/analytics/weeklyNutritionSummary.js";
import { emptyMealProactiveSnapshot } from "../../nutrition/mealProactiveSignals.js";
import { weeklyNutritionReviewHandler } from "./weeklyNutritionReview.js";
import type { ProactiveKindContext } from "./types.js";

function ctx(overrides: Partial<ProactiveKindContext> = {}): ProactiveKindContext {
  const meals = emptyMealProactiveSnapshot();
  return {
    now: new Date("2026-08-09T18:05:00.000Z"),
    userProfileId: "u1",
    telegramChatId: "123",
    timezone: "UTC",
    subscription: {
      id: "s1",
      userProfileId: "u1",
      kind: "weekly_nutrition_review",
      enabled: true,
      triggerType: "recurring",
      schedule: { type: "recurring_local", localHour: 18, windowMinutes: 20 },
      config: {},
      userInstruction: null,
      source: "user_chat",
      capBucket: "scheduled",
      cooldownHours: null,
      lastSentAt: null,
      nextFireAt: null,
      createdAt: "",
      updatedAt: "",
    },
    signals: {
      now: new Date("2026-08-09T18:05:00.000Z"),
      timezone: "UTC",
      local: { hour: 18, minute: 5, dateKey: "2026-08-09" },
      hasCheckinToday: false,
      hevyConnected: false,
      gymPlannedToday: false,
      workoutLoggedToday: false,
      recentUserChatSnippet: "",
      userGraphSummary: "",
      weeklyScheduleExcerpt: "",
      programWatchExcerpt: "",
      meals,
    },
    ...overrides,
  };
}

describe("weeklyNutritionReviewHandler", () => {
  it("fires on Sunday in the configured window with data", async () => {
    vi.mocked(loadWeeklyNutritionSummary).mockResolvedValue({
      fromDate: "2026-08-03",
      toDate: "2026-08-09",
      daysLogged: 5,
      avgCalories: 1900,
      avgProtein_g: 130,
      avgAdherence: 0.8,
      topFlags: [],
      missedSlotCounts: {},
    });

    const result = await weeklyNutritionReviewHandler.evaluate(ctx());
    expect(result.candidate).toBe(true);
  });

  it("does not fire on non-Sunday", async () => {
    const result = await weeklyNutritionReviewHandler.evaluate(
      ctx({
        now: new Date("2026-08-08T18:05:00.000Z"),
        signals: {
          ...ctx().signals,
          local: { hour: 18, minute: 5, dateKey: "2026-08-08" },
        },
      }),
    );
    expect(result.candidate).toBe(false);
    expect(result.reason).toBe("not_sunday");
  });
});
