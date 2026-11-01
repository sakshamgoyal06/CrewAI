import { describe, expect, it } from "vitest";

import {
  consolidateMealItemLines,
  consolidateMealNutritionEstimate,
  tokenizeFoodName,
} from "./mealItemConsolidate.js";

describe("consolidateMealItemLines", () => {
  it("drops a short name that is a consecutive subsequence of a longer line", () => {
    const out = consolidateMealItemLines([
      { name: "masala", calories: 50, protein_g: 1, carbs_g: 5, fat_g: 2 },
      { name: "chhole masala", calories: 400, protein_g: 15, carbs_g: 40, fat_g: 12 },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.name).toBe("chhole masala");
  });

  it("dedupes identical normalized names keeping higher calories", () => {
    const out = consolidateMealItemLines([
      { name: "burrito bowl", calories: 400, protein_g: 10, carbs_g: 40, fat_g: 14 },
      { name: "Burrito Bowl", calories: 400, protein_g: 10, carbs_g: 40, fat_g: 14 },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.calories).toBe(400);
  });

  it("merges chhole masala and chickpea curry into one line (synonym overlap)", () => {
    const out = consolidateMealItemLines([
      { name: "chhole masala", calories: 380, protein_g: 14, carbs_g: 38, fat_g: 11 },
      { name: "chickpea curry", calories: 360, protein_g: 13, carbs_g: 36, fat_g: 10 },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.calories).toBe(380);
  });

  it("does not merge palak chole with chhole masala (green vs non-green)", () => {
    const out = consolidateMealItemLines([
      { name: "palak chole", calories: 300, protein_g: 12, carbs_g: 20, fat_g: 10 },
      { name: "chhole masala", calories: 400, protein_g: 14, carbs_g: 40, fat_g: 12 },
    ]);
    expect(out).toHaveLength(2);
  });

  it("does not treat egg as redundant with eggplant", () => {
    const out = consolidateMealItemLines([
      { name: "egg", calories: 70, protein_g: 6, carbs_g: 1, fat_g: 5 },
      { name: "eggplant", calories: 25, protein_g: 1, carbs_g: 6, fat_g: 0 },
    ]);
    expect(out).toHaveLength(2);
  });
});

describe("consolidateMealNutritionEstimate", () => {
  it("recomputes totals after dropping lines", () => {
    const est = consolidateMealNutritionEstimate({
      calories: 450,
      protein_g: 16,
      carbs_g: 45,
      fat_g: 14,
      items: [
        { name: "masala", calories: 50, protein_g: 1, carbs_g: 5, fat_g: 2 },
        { name: "chhole masala", calories: 400, protein_g: 15, carbs_g: 40, fat_g: 12 },
      ],
      source: "calorieninjas",
      providerRaw: null,
    });
    expect(est.items).toHaveLength(1);
    expect(est.calories).toBe(400);
  });
});

describe("tokenizeFoodName", () => {
  it("splits on punctuation", () => {
    expect(tokenizeFoodName("chhole masala")).toEqual(["chhole", "masala"]);
  });
});
