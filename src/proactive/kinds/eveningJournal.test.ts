import { describe, expect, it } from "vitest";

import { eveningJournalHandler } from "./eveningJournal.js";
import type { ProactiveKindContext } from "./types.js";

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
      hevyConnected: true,
      gymPlannedToday: false,
      workoutLoggedToday: false,
      recentUserChatSnippet: "",
      userGraphSummary: "",
      weeklyScheduleExcerpt: "",
      programWatchExcerpt: "",
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

  it("skips llm gate when check-in exists", async () => {
    const gate = await eveningJournalHandler.llmGate(
      ctx({
        signals: { ...ctx().signals, hasCheckinToday: true },
      }),
      { candidate: true },
    );
    expect(gate.send).toBe(false);
  });
});
