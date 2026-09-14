import { describe, expect, it } from "vitest";

import { buildMealComponentsFromEstimate } from "./mealComponents.js";

describe("buildMealComponentsFromEstimate", () => {
  it("returns one row when items empty", () => {
    const c = buildMealComponentsFromEstimate(
      {
        calories: 100,
        protein_g: 10,
        carbs_g: 20,
        fat_g: 5,
        items: [],
        source: "unavailable",
        providerRaw: null,
      },
      "rice bowl",
    );
    expect(c).toHaveLength(1);
    expect(c[0]!.label).toBe("rice bowl");
    expect(c[0]!.calories).toBe(100);
  });

  it("splits multi-item CalorieNinjas-style lines", () => {
    const c = buildMealComponentsFromEstimate(
      {
        calories: 300,
        protein_g: 15,
        carbs_g: 30,
        fat_g: 10,
        items: [
          { name: "apple", calories: 100, protein_g: 1, carbs_g: 20, fat_g: 0 },
          { name: "bread", calories: 200, protein_g: 8, carbs_g: 10, fat_g: 5 },
        ],
        source: "calorieninjas",
        providerRaw: null,
      },
      "apple, bread",
    );
    expect(c).toHaveLength(2);
    expect(c[0]!.label).toBe("apple");
    expect(c[1]!.label).toBe("bread");
    expect(c[0]!.calories).toBe(100);
    expect(c[1]!.protein_g).toBe(8);
  });

  it("prefers user phrases when they align with item count", () => {
    const c = buildMealComponentsFromEstimate(
      {
        calories: 300,
        protein_g: 15,
        carbs_g: 30,
        fat_g: 10,
        items: [
          { name: "onion", calories: 100, protein_g: 1, carbs_g: 20, fat_g: 0 },
          { name: "tomato", calories: 200, protein_g: 8, carbs_g: 10, fat_g: 5 },
        ],
        source: "calorieninjas",
        providerRaw: null,
      },
      "50g aloo baingan, 30g chhole",
    );
    expect(c[0]!.label).toBe("50g aloo baingan");
    expect(c[1]!.label).toBe("30g chhole");
  });

  it("uses joined user phrases for single aggregate item", () => {
    const c = buildMealComponentsFromEstimate(
      {
        calories: 400,
        protein_g: 20,
        carbs_g: 40,
        fat_g: 12,
        items: [{ name: "burrito", calories: 400, protein_g: 20, carbs_g: 40, fat_g: 12 }],
        source: "calorieninjas",
        providerRaw: null,
      },
      "rice, beans, and cheese",
    );
    expect(c).toHaveLength(1);
    expect(c[0]!.label).toBe("rice, beans, cheese");
  });

  it("one user phrase + multiple API lines → single component row (composite meal)", () => {
    const c = buildMealComponentsFromEstimate(
      {
        calories: 550,
        protein_g: 22,
        carbs_g: 55,
        fat_g: 18,
        items: [
          { name: "burrito bowl", calories: 350, protein_g: 14, carbs_g: 35, fat_g: 12 },
          { name: "cooked rice", calories: 200, protein_g: 8, carbs_g: 20, fat_g: 6 },
        ],
        source: "calorieninjas",
        providerRaw: null,
      },
      "chipotle burrito bowl",
    );
    expect(c).toHaveLength(1);
    expect(c[0]!.label).toBe("chipotle burrito bowl");
    expect(c[0]!.itemsSnapshot).toHaveLength(2);
    expect(c[0]!.calories).toBe(550);
  });

  it("parser per_component estimates keep one row per item even with a single user phrase", () => {
    const c = buildMealComponentsFromEstimate(
      {
        calories: 300,
        protein_g: 12,
        carbs_g: 30,
        fat_g: 9,
        items: [
          { name: "rice", calories: 200, protein_g: 4, carbs_g: 40, fat_g: 2 },
          { name: "dal", calories: 100, protein_g: 8, carbs_g: 12, fat_g: 4 },
        ],
        source: "calorieninjas",
        providerRaw: { per_component: [] },
      },
      "lunch thali",
    );
    expect(c).toHaveLength(2);
    expect(c[0]!.label).toBe("rice");
    expect(c[1]!.label).toBe("dal");
  });
});
