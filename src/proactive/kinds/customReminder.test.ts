import { describe, expect, it } from "vitest";

import { emptyMealProactiveSnapshot } from "../../nutrition/mealProactiveSignals.js";
import type { ProactiveKindContext } from "./types.js";
import { customReminderHandler } from "./customReminder.js";

function ctx(input: { at: string; now: string }): ProactiveKindContext {
  const now = new Date(input.now);
  return {
    now,
    userProfileId: "user-1",
    telegramChatId: "chat-1",
    timezone: "Asia/Kolkata",
    subscription: {
      id: "sub-1",
      userProfileId: "user-1",
      kind: "custom_reminder",
      enabled: true,
      triggerType: "one_shot",
      schedule: { type: "one_shot", at: input.at },
      config: { message: "Call mom" },
      userInstruction: "Call mom",
      source: "user_chat",
      capBucket: "user_asked",
      cooldownHours: null,
      lastSentAt: null,
      nextFireAt: input.at,
      createdAt: "",
      updatedAt: "",
    },
    signals: {
      now,
      timezone: "Asia/Kolkata",
      local: { hour: 9, minute: 15, dateKey: "2026-09-10" },
      hasCheckinToday: false,
      dailyLog: {
        dateKey: "2026-09-10",
        completeness: "empty",
        hasMorningIntention: false,
        hasEveningReflection: false,
        hasJournalNote: false,
        hasHealthJournal: false,
        declinedEvening: false,
        shouldNudgeEvening: false,
        shouldFollowUpEvening: false,
      },
      hevyConnected: false,
      gymPlannedToday: false,
      workoutLoggedToday: false,
      recentUserChatSnippet: "",
      userGraphSummary: "",
      weeklyScheduleExcerpt: "",
      programWatchExcerpt: "",
      meals: emptyMealProactiveSnapshot(),
    },
  };
}

describe("customReminderHandler.evaluate one-shot", () => {
  it("is due inside the 24h late window", async () => {
    const result = await customReminderHandler.evaluate(
      ctx({
        at: "2026-09-07T11:30:00.000Z",
        now: "2026-09-08T10:00:00.000Z",
      }),
    );
    expect(result).toEqual({ candidate: true, reason: "due" });
  });

  it("rejects stale reminders older than 24h", async () => {
    const result = await customReminderHandler.evaluate(
      ctx({
        at: "2026-09-07T11:30:00.000Z",
        now: "2026-09-10T03:45:00.000Z",
      }),
    );
    expect(result).toEqual({ candidate: false, reason: "expired" });
  });
});
