import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../signals/inactivitySignals.js", () => ({
  loadChatInactivitySnapshot: vi.fn(),
}));

import { emptyMealProactiveSnapshot } from "../../nutrition/mealProactiveSignals.js";
import { loadChatInactivitySnapshot } from "../signals/inactivitySignals.js";
import { chatInactivityHandler } from "./chatInactivity.js";
import type { ProactiveKindContext } from "./types.js";

function ctx(overrides: Partial<ProactiveKindContext> = {}): ProactiveKindContext {
  return {
    now: new Date("2026-08-06T12:00:00.000Z"),
    userProfileId: "u1",
    telegramChatId: "123",
    timezone: "UTC",
    subscription: {
      id: "s1",
      userProfileId: "u1",
      kind: "chat_inactivity",
      enabled: true,
      triggerType: "conditional",
      schedule: { type: "conditional" },
      config: { inactivityDays: 3 },
      userInstruction: null,
      source: "user_chat",
      capBucket: "adaptive",
      cooldownHours: 48,
      lastSentAt: null,
      nextFireAt: null,
      createdAt: "",
      updatedAt: "",
    },
    signals: {
      now: new Date("2026-08-06T12:00:00.000Z"),
      timezone: "UTC",
      local: { hour: 12, minute: 0, dateKey: "2026-08-06" },
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

describe("chatInactivityHandler", () => {
  beforeEach(() => {
    vi.mocked(loadChatInactivitySnapshot).mockResolvedValue({
      lastUserMessageAt: new Date("2026-08-01T12:00:00.000Z"),
      daysSinceLastMessage: 5,
      hoursSinceLastMessage: 120,
    });
  });

  it("evaluates true when inactive long enough", async () => {
    const result = await chatInactivityHandler.evaluate(ctx());
    expect(result.candidate).toBe(true);
  });

  it("evaluates false when recently active", async () => {
    vi.mocked(loadChatInactivitySnapshot).mockResolvedValue({
      lastUserMessageAt: new Date("2026-08-05T12:00:00.000Z"),
      daysSinceLastMessage: 1,
      hoursSinceLastMessage: 24,
    });

    const result = await chatInactivityHandler.evaluate(ctx());
    expect(result.candidate).toBe(false);
  });

  it("evaluates false outside daytime window", async () => {
    const result = await chatInactivityHandler.evaluate(
      ctx({
        signals: {
          ...ctx().signals,
          local: { hour: 22, minute: 0, dateKey: "2026-08-06" },
        },
      }),
    );
    expect(result.candidate).toBe(false);
  });
});
