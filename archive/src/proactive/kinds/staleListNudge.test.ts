import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../signals/listNudgeSignals.js", () => ({
  loadStaleListSnapshot: vi.fn(),
  formatStaleListSummary: vi.fn(() => "watchlist: 2 stale"),
}));

vi.mock("../llm/gateAndCompose.js", () => ({
  gateAndCompose: vi.fn(),
}));

import { loadStaleListSnapshot } from "../signals/listNudgeSignals.js";
import { emptyMealProactiveSnapshot } from "../../nutrition/mealProactiveSignals.js";
import { staleListNudgeHandler } from "./staleListNudge.js";
import type { ProactiveKindContext } from "./types.js";

function ctx(overrides: Partial<ProactiveKindContext> = {}): ProactiveKindContext {
  return {
    now: new Date("2026-08-06T16:05:00.000Z"),
    userProfileId: "u1",
    telegramChatId: "123",
    timezone: "UTC",
    subscription: {
      id: "s1",
      userProfileId: "u1",
      kind: "stale_list_nudge",
      enabled: true,
      triggerType: "conditional",
      schedule: { type: "conditional" },
      config: { localHour: 16, staleDays: 14, minItems: 2 },
      userInstruction: null,
      source: "user_chat",
      capBucket: "adaptive",
      cooldownHours: 72,
      lastSentAt: null,
      nextFireAt: null,
      createdAt: "",
      updatedAt: "",
    },
    signals: {
      now: new Date("2026-08-06T16:05:00.000Z"),
      timezone: "UTC",
      local: { hour: 16, minute: 5, dateKey: "2026-08-06" },
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

describe("staleListNudgeHandler", () => {
  beforeEach(() => {
    vi.mocked(loadStaleListSnapshot).mockResolvedValue({
      staleItems: [],
      totalStale: 0,
      bySlug: {},
    });
  });

  it("evaluates true when enough stale items in window", async () => {
    vi.mocked(loadStaleListSnapshot).mockResolvedValue({
      staleItems: [
        {
          slug: "watchlist",
          displayName: "Watchlist",
          title: "Dune",
          status: "Want to Watch",
          daysSinceUpdate: 20,
        },
        {
          slug: "watchlist",
          displayName: "Watchlist",
          title: "Arrival",
          status: "Want to Watch",
          daysSinceUpdate: 18,
        },
      ],
      totalStale: 2,
      bySlug: { watchlist: 2 },
    });

    const result = await staleListNudgeHandler.evaluate(ctx());
    expect(result.candidate).toBe(true);
  });

  it("evaluates false outside local hour window", async () => {
    const result = await staleListNudgeHandler.evaluate(
      ctx({
        signals: {
          ...ctx().signals,
          local: { hour: 10, minute: 0, dateKey: "2026-08-06" },
        },
      }),
    );
    expect(result.candidate).toBe(false);
  });
});
