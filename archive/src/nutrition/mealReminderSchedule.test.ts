import { describe, expect, it } from "vitest";

import { parseMealTimingOverrides, slotHour } from "./mealReminderSchedule.js";

describe("mealReminderSchedule", () => {
  it("uses default slot hours", () => {
    expect(slotHour("lunch")).toBe(13);
  });

  it("parses breakfast hour from timing notes", () => {
    const overrides = parseMealTimingOverrides("breakfast around 8am, lunch at work");
    expect(overrides.breakfast).toBe(8);
  });
});
