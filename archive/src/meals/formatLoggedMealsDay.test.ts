import { describe, expect, it } from "vitest";

import { formatLoggedMealsDay } from "./formatLoggedMealsDay.js";

describe("formatLoggedMealsDay", () => {
  it("shows logged sessions and total only", () => {
    const text = formatLoggedMealsDay(
      [
        {
          mealSessionId: "s1",
          mealSlot: "breakfast",
          rawText: "tea",
          calories: 90,
          protein_g: 2,
          carbs_g: 14,
          fat_g: 2,
          loggedAt: "2026-08-11T09:00:00Z",
          localDate: "2026-08-11",
          logKind: "meal",
          componentCount: 1,
        },
      ],
      { date: "2026-08-11", calories: 90, protein_g: 2, carbs_g: 14, fat_g: 2 },
      "Today",
      "2026-08-11",
    );
    expect(text).toContain("logged");
    expect(text).toContain("Logged total:** 90 kcal");
    expect(text).not.toContain("planned");
  });
});
