import { describe, expect, it } from "vitest";

import {
  isSameReminder,
  normalizeReminderText,
  reminderContentKey,
  reminderQueryScore,
  reminderSimilarity,
  reminderTokens,
  REMINDER_QUERY_THRESHOLD,
} from "./reminderMatch.js";

const CORIANDER = "💧 Change the water in your coriander plant!";

describe("normalizeReminderText", () => {
  it("strips emoji and punctuation", () => {
    expect(normalizeReminderText(CORIANDER)).toBe("change the water in your coriander plant");
  });
});

describe("reminderTokens", () => {
  it("drops filler words so intent tokens remain", () => {
    expect(reminderTokens("Cancel reminders for coriander water change")).toEqual([
      "coriander",
      "water",
    ]);
  });
});

describe("reminderQueryScore", () => {
  it("matches the production cancel request that used to fail", () => {
    const score = reminderQueryScore("Cancel reminders for coriander water change", CORIANDER);
    expect(score).toBeGreaterThanOrEqual(REMINDER_QUERY_THRESHOLD);
  });

  it("matches a terse description", () => {
    expect(reminderQueryScore("coriander water", CORIANDER)).toBe(1);
  });

  it("matches the second production attempt", () => {
    const score = reminderQueryScore("Stop the water corriander reminder", CORIANDER);
    expect(score).toBeGreaterThan(0);
  });

  it("does not match an unrelated reminder", () => {
    expect(reminderQueryScore("call mom", CORIANDER)).toBeLessThan(REMINDER_QUERY_THRESHOLD);
  });

  it("scores an empty query as zero", () => {
    expect(reminderQueryScore("   ", CORIANDER)).toBe(0);
  });
});

describe("reminderSimilarity / isSameReminder", () => {
  it("treats identical bodies as the same reminder", () => {
    expect(reminderSimilarity(CORIANDER, CORIANDER)).toBe(1);
    expect(isSameReminder(CORIANDER, "Change the water in your coriander plant")).toBe(true);
  });

  it("treats the same reminder with a different emoji as the same", () => {
    expect(isSameReminder(CORIANDER, "🌿 change the water in your coriander plant")).toBe(true);
  });

  it("keeps different reminders apart", () => {
    expect(isSameReminder(CORIANDER, "Call mom 📞")).toBe(false);
    expect(isSameReminder("Evening gym reminder", "Time to build Magnus")).toBe(false);
  });
});

describe("reminderContentKey", () => {
  it("collapses duplicate rows onto one delivery key", () => {
    expect(reminderContentKey(CORIANDER)).toBe(
      reminderContentKey("Change the water in your coriander plant"),
    );
  });

  it("keeps distinct reminders on distinct keys", () => {
    expect(reminderContentKey("Call mom 📞")).not.toBe(reminderContentKey(CORIANDER));
  });
});
