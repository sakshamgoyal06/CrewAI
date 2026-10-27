import { describe, expect, it } from "vitest";

import {
  formatMealBreakdown,
  formatMealLogReplyCompact,
  targetIndicators,
  targetIndicatorsCompact,
} from "./formatMealLogReply.js";

const sampleComponents = [
  {
    componentIndex: 0,
    label: "egg",
    calories: 70,
    protein_g: 6,
    carbs_g: 0.5,
    fat_g: 5,
    itemsSnapshot: [],
  },
];

const sampleEstimate = {
  calories: 70,
  protein_g: 6,
  carbs_g: 0.5,
  fat_g: 5,
  items: [],
  source: "calorieninjas" as const,
  providerRaw: null,
};

describe("targetIndicators", () => {
  it("marks calories green when under target", () => {
    const lines = targetIndicators(
      { date: "2026-04-12", calories: 1800, protein_g: 80, carbs_g: 100, fat_g: 50 },
      {
        daily_calorie_target: 2000,
        daily_protein_g_target: 70,
        daily_carbs_g_target: 150,
        daily_fat_g_target: 60,
      },
    );
    expect(lines.some((l) => l.includes("🟢") && l.includes("Calories"))).toBe(true);
    expect(lines.some((l) => l.includes("🟢") && l.includes("Protein"))).toBe(true);
  });

  it("marks red when over calorie target", () => {
    const lines = targetIndicators(
      { date: "2026-04-12", calories: 2200, protein_g: 80, carbs_g: 100, fat_g: 50 },
      {
        daily_calorie_target: 2000,
        daily_protein_g_target: null,
        daily_carbs_g_target: null,
        daily_fat_g_target: null,
      },
    );
    expect(lines.some((l) => l.includes("🔴") && l.includes("Calories"))).toBe(true);
  });
});

describe("targetIndicatorsCompact", () => {
  it("returns a short one-line summary", () => {
    const line = targetIndicatorsCompact(
      { date: "2026-04-12", calories: 1800, protein_g: 80, carbs_g: 100, fat_g: 50 },
      {
        daily_calorie_target: 2000,
        daily_protein_g_target: 70,
        daily_carbs_g_target: null,
        daily_fat_g_target: null,
      },
    );
    expect(line).toContain("🟢");
    expect(line).not.toContain("≤ target");
  });
});

describe("formatMealLogReplyCompact", () => {
  it("is short and omits source, session id, and component list", () => {
    const text = formatMealLogReplyCompact({
      mealSessionId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      loggedDate: "2026-04-12",
      timezoneLabel: "UTC",
      rawText: "test meal",
      estimate: sampleEstimate,
      components: sampleComponents,
      mealTotals: { calories: 70, protein_g: 6, carbs_g: 0.5, fat_g: 5 },
      day: { date: "2026-04-12", calories: 70, protein_g: 6, carbs_g: 0.5, fat_g: 5 },
      daySessionCount: 1,
      targets: null,
    });
    expect(text).toContain("Meal logged");
    expect(text).toContain("70 kcal");
    expect(text).toContain("Today (logged, 1 entry)");
    expect(text).toContain("meal breakdown");
    expect(text).not.toContain("Source:");
    expect(text).not.toContain("aaaaaaaa");
    expect(text).not.toContain("Components");
  });

  it("includes plan match when linked", () => {
    const text = formatMealLogReplyCompact({
      mealSessionId: "sess",
      loggedDate: "2026-04-12",
      timezoneLabel: "UTC",
      mealSlot: "lunch",
      planLink: { linked: true, planTitle: "Dal bowl", matched: true },
      rawText: "dal bowl",
      estimate: sampleEstimate,
      components: sampleComponents,
      mealTotals: { calories: 70, protein_g: 6, carbs_g: 0.5, fat_g: 5 },
      day: { date: "2026-04-12", calories: 70, protein_g: 6, carbs_g: 0.5, fat_g: 5 },
      daySessionCount: 1,
      targets: null,
    });
    expect(text).toContain("Lunch logged");
    expect(text).toContain("Plan matched");
  });
});

describe("formatMealBreakdown", () => {
  it("lists per-component macros for follow-up", () => {
    const text = formatMealBreakdown({
      mealSlot: "lunch",
      rawText: "egg and toast",
      components: sampleComponents,
      mealTotals: { calories: 70, protein_g: 6, carbs_g: 0.5, fat_g: 5 },
    });
    expect(text).toContain("Lunch breakdown");
    expect(text).toContain("egg");
    expect(text).toContain("Total:");
    expect(text).not.toContain("Source:");
  });
});
