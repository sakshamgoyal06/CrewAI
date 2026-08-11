import { describe, expect, it } from "vitest";

import { formatMultiMealLogReply } from "./mealLogCompose.js";

describe("formatMultiMealLogReply", () => {
  it("lists only saved meals and uses authoritative day total", () => {
    const text = formatMultiMealLogReply({
      entries: [
        {
          mealSlot: "breakfast",
          headline: "Breakfast — tea",
          totals: { calories: 90, protein_g: 2.5, carbs_g: 14, fat_g: 2.5 },
        },
        {
          mealSlot: "lunch",
          headline: "Lunch — parathas, raita, sabzi",
          totals: { calories: 514, protein_g: 15.2, carbs_g: 60.6, fat_g: 24 },
        },
        {
          mealSlot: "snack",
          headline: "Snack — tea",
          totals: { calories: 90, protein_g: 2.5, carbs_g: 14, fat_g: 2.5 },
        },
      ],
      dayTotals: { calories: 694, protein_g: 20.2, carbs_g: 88.6, fat_g: 29 },
    });

    expect(text).toContain("Breakfast — tea");
    expect(text).toContain("Snack — tea");
    expect(text).toContain("Logged this turn");
    expect(text).toContain("~694 kcal");
    expect(text).toContain("Today (logged):** 694 kcal");
    expect(text).not.toContain("1930");
    expect(text).not.toContain("Afternoon tea");
  });
});
