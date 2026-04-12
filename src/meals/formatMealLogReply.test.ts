import { describe, expect, it } from "vitest";

import { formatMealLogReply, targetIndicators } from "./formatMealLogReply.js";

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

describe("formatMealLogReply", () => {
  it("includes components and session id prefix", () => {
    const text = formatMealLogReply({
      mealSessionId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      loggedDate: "2026-04-12",
      rawText: "test meal",
      estimate: {
        calories: 70,
        protein_g: 6,
        carbs_g: 0.5,
        fat_g: 5,
        items: [],
        source: "calorieninjas",
        providerRaw: null,
      },
      components: [
        {
          componentIndex: 0,
          label: "egg",
          calories: 70,
          protein_g: 6,
          carbs_g: 0.5,
          fat_g: 5,
          itemsSnapshot: [],
        },
      ],
      mealTotals: { calories: 70, protein_g: 6, carbs_g: 0.5, fat_g: 5 },
      day: { date: "2026-04-12", calories: 70, protein_g: 6, carbs_g: 0.5, fat_g: 5 },
      targets: null,
    });
    expect(text).toContain("aaaaaaaa");
    expect(text).toContain("egg");
    expect(text).toContain("Today so far");
  });

  it("shows portion notes and aggregate serving_assumption when present", () => {
    const text = formatMealLogReply({
      mealSessionId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      loggedDate: "2026-04-12",
      rawText: "50g rice",
      estimate: {
        calories: 100,
        protein_g: 2,
        carbs_g: 22,
        fat_g: 0.5,
        items: [],
        source: "web_research",
        providerRaw: null,
        serving_assumption: "Scaled from 130 kcal/100g cooked rice.",
      },
      components: [
        {
          componentIndex: 0,
          label: "50g rice",
          calories: 100,
          protein_g: 2,
          carbs_g: 22,
          fat_g: 0.5,
          itemsSnapshot: [{ name: "rice", portion_note: "Basis: USDA-style cooked white rice." }],
        },
      ],
      mealTotals: { calories: 100, protein_g: 2, carbs_g: 22, fat_g: 0.5 },
      day: { date: "2026-04-12", calories: 100, protein_g: 2, carbs_g: 22, fat_g: 0.5 },
      targets: null,
    });
    expect(text).toContain("Portion / source notes");
    expect(text).toContain("130 kcal/100g");
    expect(text).toContain("USDA-style");
  });

  it("explains multi-component rows are summed once for meal total", () => {
    const text = formatMealLogReply({
      mealSessionId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      loggedDate: "2026-04-12",
      rawText: "bread; sauce; veg",
      estimate: {
        calories: 300,
        protein_g: 20,
        carbs_g: 30,
        fat_g: 10,
        items: [],
        source: "calorieninjas",
        providerRaw: null,
      },
      components: [
        {
          componentIndex: 0,
          label: "bread",
          calories: 200,
          protein_g: 8,
          carbs_g: 24,
          fat_g: 4,
          itemsSnapshot: [],
        },
        {
          componentIndex: 1,
          label: "sauce",
          calories: 50,
          protein_g: 1,
          carbs_g: 4,
          fat_g: 3,
          itemsSnapshot: [],
        },
      ],
      mealTotals: { calories: 250, protein_g: 9, carbs_g: 28, fat_g: 7 },
      day: { date: "2026-04-12", calories: 250, protein_g: 9, carbs_g: 28, fat_g: 7 },
      targets: null,
    });
    expect(text).toContain("not double-counted");
  });
});
