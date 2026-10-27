import { describe, expect, it, vi } from "vitest";

vi.mock("../llm/gateAndCompose.js", () => ({
  gateAndCompose: vi.fn(),
}));

import { emptyMealProactiveSnapshot } from "../../nutrition/mealProactiveSignals.js";
import { mealLogReminderHandler } from "./mealLogReminder.js";
import type { ProactiveKindContext } from "./types.js";

function ctx(overrides: Partial<ProactiveKindContext> = {}): ProactiveKindContext {
  const meals = emptyMealProactiveSnapshot();
  return {
    now: new Date("2026-08-06T13:05:00.000Z"),
    userProfileId: "u1",
    telegramChatId: "123",
    timezone: "UTC",
    subscription: {
      id: "s1",
      userProfileId: "u1",
      kind: "meal_log_reminder",
      enabled: true,
      triggerType: "conditional",
      schedule: { type: "conditional" },
      config: { windowMinutes: 30 },
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
      now: new Date("2026-08-06T13:05:00.000Z"),
      timezone: "UTC",
      local: { hour: 13, minute: 5, dateKey: "2026-08-06" },
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

describe("mealLogReminderHandler", () => {
  it("fires in lunch window when lunch not logged", async () => {
    const result = await mealLogReminderHandler.evaluate(ctx());
    expect(result.candidate).toBe(true);
    expect(result.signals?.slot).toBe("lunch");
  });

  it("does not fire when lunch already logged", async () => {
    const meals = emptyMealProactiveSnapshot();
    meals.mealsLoggedTodaySlots = ["lunch"];
    const result = await mealLogReminderHandler.evaluate(
      ctx({
        signals: { ...ctx().signals, meals },
      }),
    );
    expect(result.candidate).toBe(false);
  });
});
