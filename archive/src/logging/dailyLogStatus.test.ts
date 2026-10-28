import { describe, expect, it } from "vitest";

import { hasEveningReflectionFields, parseCheckinFields } from "./checkinFields.js";
import { resolveCompleteness } from "./dailyLogStatus.test-helpers.js";

describe("checkinFields", () => {
  it("detects evening reflection from scores and notes", () => {
    expect(
      hasEveningReflectionFields({
        dayRating: "8",
        feeling: "calm",
      }),
    ).toBe(true);
    expect(hasEveningReflectionFields({ morningIntention: "Ship PR" })).toBe(false);
    expect(
      hasEveningReflectionFields({
        notes: "Short",
      }),
    ).toBe(false);
    expect(
      hasEveningReflectionFields({
        notes: "Long enough reflection for the day",
      }),
    ).toBe(true);
  });

  it("parses structured extra keys", () => {
    const fields = parseCheckinFields(
      {
        "Morning Intention": "Ship PR",
        "Day Rating": "7",
        "Joy Score": 65,
        "How Are You Feeling": "tired but good",
      },
      "Evening notes here",
    );
    expect(fields.morningIntention).toBe("Ship PR");
    expect(fields.dayRating).toBe("7");
    expect(fields.joyScore).toBe(65);
    expect(fields.feeling).toBe("tired but good");
    expect(fields.notes).toBe("Evening notes here");
  });
});

describe("dailyLogCompleteness", () => {
  it("maps combinations to expected states", () => {
    expect(
      resolveCompleteness({
        hasMorning: true,
        hasEvening: false,
        hasJournal: false,
        hasHealthJournal: false,
        declinedEvening: false,
      }),
    ).toBe("morning_only");

    expect(
      resolveCompleteness({
        hasMorning: false,
        hasEvening: true,
        hasJournal: false,
        hasHealthJournal: false,
        declinedEvening: false,
      }),
    ).toBe("complete");

    expect(
      resolveCompleteness({
        hasMorning: false,
        hasEvening: false,
        hasJournal: false,
        hasHealthJournal: false,
        declinedEvening: true,
      }),
    ).toBe("declined");
  });
});
