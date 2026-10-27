import { describe, expect, it, vi } from "vitest";

vi.mock("../rhythm/daySummary.js", () => ({
  buildDayRhythmSummary: vi.fn(async () => ({
    dateKey: "2026-08-06",
    done: 1,
    missed: 0,
    open: 0,
    moved: 0,
    text: "Day summary stub",
  })),
}));

import { emptyMealProactiveSnapshot } from "../../nutrition/mealProactiveSignals.js";
import { eveningJournalHandler } from "./eveningJournal.js";
import type { ProactiveKindContext } from "./types.js";
import type { DailyLogStatus } from "../../logging/types.js";

function emptyDailyLog(dateKey: string): DailyLogStatus {
  return {
    dateKey,
    completeness: "empty",
    hasMorningIntention: false,
    hasEveningReflection: false,
    hasJournalNote: false,
    hasHealthJournal: false,
    declinedEvening: false,
    shouldNudgeEvening: true,
    shouldFollowUpEvening: false,
  };
}

function ctx(overrides: Partial<ProactiveKindContext> = {}): ProactiveKindContext {
  return {
    now: new Date("2026-08-06T15:30:00.000Z"),
    userProfileId: "u1",
    telegramChatId: "123",
    timezone: "UTC",
    subscription: {
      id: "s1",
      userProfileId: "u1",
      kind: "evening_journal",
      enabled: true,
      triggerType: "recurring",
      schedule: { type: "recurring_local", localHour: 21, windowMinutes: 14 },
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
      now: new Date("2026-08-06T15:30:00.000Z"),
      timezone: "UTC",
      local: { hour: 21, minute: 5, dateKey: "2026-08-06" },
      hasCheckinToday: false,
      dailyLog: emptyDailyLog("2026-08-06"),
      hevyConnected: true,
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

describe("eveningJournalHandler", () => {
  it("evaluates true inside local hour window", async () => {
    const result = await eveningJournalHandler.evaluate(ctx());
    expect(result.candidate).toBe(true);
  });

  it("evaluates false outside window", async () => {
    const result = await eveningJournalHandler.evaluate(
      ctx({
        signals: {
          ...ctx().signals,
          local: { hour: 10, minute: 0, dateKey: "2026-08-06" },
        },
      }),
    );
    expect(result.candidate).toBe(false);
  });

  it("skips llm gate when evening reflection exists", async () => {
    const gate = await eveningJournalHandler.llmGate(
      ctx({
        signals: {
          ...ctx().signals,
          hasCheckinToday: true,
          dailyLog: {
            ...emptyDailyLog("2026-08-06"),
            completeness: "complete",
            hasEveningReflection: true,
          },
        },
      }),
      { candidate: true },
    );
    expect(gate.send).toBe(false);
  });
});
