import { describe, expect, it } from "vitest";

import { buildAggregateMealEstimate } from "./mealParserAgent.js";
import type { MealNutritionEstimate } from "../../meals/types.js";

describe("buildAggregateMealEstimate", () => {
  it("sums macros and keeps one item line per parser component", () => {
    const est: MealNutritionEstimate = {
      calories: 100,
      protein_g: 3,
      carbs_g: 20,
      fat_g: 1,
      items: [{ name: "apple", calories: 100, protein_g: 3, carbs_g: 20, fat_g: 1 }],
      source: "calorieninjas",
      providerRaw: { x: 1 },
    };
    const agg = buildAggregateMealEstimate(
      [
        { user_label: "morning fruit", api_query: "1 medium apple" },
        { user_label: "toast", api_query: "1 slice whole wheat bread" },
      ],
      [
        est,
        {
          calories: 80,
          protein_g: 4,
          carbs_g: 14,
          fat_g: 1,
          items: [{ name: "bread", calories: 80, protein_g: 4, carbs_g: 14, fat_g: 1 }],
          source: "calorieninjas",
          providerRaw: { y: 2 },
        },
      ],
    );
    expect(agg.calories).toBe(180);
    expect(agg.items).toHaveLength(2);
    expect(agg.items[0]!.name).toBe("morning fruit");
    expect(agg.items[1]!.name).toBe("toast");
    expect(agg.providerRaw).toMatchObject({ per_component: expect.any(Array) });
  });
});
