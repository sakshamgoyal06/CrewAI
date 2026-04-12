import { describe, expect, it } from "vitest";

import { scaleCalorieNinjaLinesByUserGrams } from "./calorieNinjasScale.js";

describe("scaleCalorieNinjaLinesByUserGrams", () => {
  it("scales macros when user grams are below API serving", () => {
    const out = scaleCalorieNinjaLinesByUserGrams("30g chhole masala", [
      {
        name: "chickpea",
        calories: 570,
        protein_g: 20,
        carbs_g: 90,
        fat_g: 10,
        serving_size_g: 250,
      },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.calories).toBeCloseTo((570 * 30) / 250, 1);
  });

  it("does not scale single API row for multi-phrase query", () => {
    const out = scaleCalorieNinjaLinesByUserGrams("50g aloo, 30g chhole", [
      {
        name: "mixed",
        calories: 400,
        protein_g: 10,
        carbs_g: 50,
        fat_g: 15,
        serving_size_g: 200,
      },
    ]);
    expect(out[0]!.calories).toBe(400);
  });

  it("bundle-scales every line when one phrase has grams but API returns multiple items", () => {
    const out = scaleCalorieNinjaLinesByUserGrams("60g chickpea curry", [
      {
        name: "chickpea",
        calories: 200,
        protein_g: 8,
        carbs_g: 30,
        fat_g: 4,
        serving_size_g: 100,
      },
      {
        name: "curry sauce",
        calories: 100,
        protein_g: 2,
        carbs_g: 10,
        fat_g: 6,
        serving_size_g: 100,
      },
    ]);
    const bundleRef = 200;
    const factor = 60 / bundleRef;
    expect(out[0]!.calories).toBeCloseTo(200 * factor, 1);
    expect(out[1]!.calories).toBeCloseTo(100 * factor, 1);
    expect(out[0]!.calories + out[1]!.calories).toBeCloseTo(300 * factor, 1);
  });

  it("scales each line when phrase count matches", () => {
    const out = scaleCalorieNinjaLinesByUserGrams("100g rice, 30g dal", [
      {
        name: "rice",
        calories: 130,
        protein_g: 2.7,
        carbs_g: 28,
        fat_g: 0.3,
        serving_size_g: 100,
      },
      {
        name: "lentils",
        calories: 116,
        protein_g: 9,
        carbs_g: 20,
        fat_g: 0.4,
        serving_size_g: 100,
      },
    ]);
    expect(out[0]!.calories).toBe(130);
    expect(out[1]!.calories).toBeCloseTo((116 * 30) / 100, 1);
  });
});
