import { describe, expect, it, vi } from "vitest";

vi.mock("./foodStore.js", () => ({
  loadFoodTables: vi.fn(),
  knownFoodNames: vi.fn(),
  recipeKey: (k: string, u: string) => `${k}|${u}`,
  saveFoods: vi.fn(),
  saveRecipes: vi.fn(),
  markFoodsUsed: vi.fn(),
}));

import { estimateWithFoodDb } from "./foodDbEstimate.js";
import type { FoodRow, FoodTables, RecipeRow } from "./foodStore.js";
import type { Breakdown } from "./providers/webBreakdown.js";

const food = (food_key: string, unit: FoodRow["unit"], calories: number, protein_g = 0, grams_per_unit: number | null = null): FoodRow => ({
  food_key, unit, display_name: food_key, grams_per_unit, calories, protein_g, carbs_g: 0, fat_g: 0, source: "web_research",
});
const tables = (foods: FoodRow[], recipes: RecipeRow[] = []): FoodTables => {
  const t: FoodTables = { foods: new Map(), recipes: new Map() };
  for (const f of foods) t.foods.set(f.food_key, [...(t.foods.get(f.food_key) ?? []), f]);
  for (const r of recipes) t.recipes.set(`${r.dish_key}|${r.unit}`, r);
  return t;
};
const quiet = {
  known: async () => [],
  markUsed: vi.fn().mockResolvedValue(undefined),
  // These cases exercise the Supabase tables; the shipped catalog is tested on its own.
  catalog: { entries: [], byKey: new Map() },
  recordGaps: vi.fn(),
};

describe("estimateWithFoodDb", () => {
  it("builds a meal from stored ingredients and dish recipes without the web", async () => {
    const web = vi.fn();
    const r = await estimateWithFoodDb("2 parathas, a burrito bowl and 100g curd", web, {
      ...quiet,
      load: async () =>
        tables(
          [food("paratha", "piece", 260, 6, 80), food("curd", "per_100g", 60, 3.5), food("white rice cooked", "per_100g", 130, 2.7), food("paneer tikka air fried", "per_100g", 260, 18)],
          [{ dish_key: "burrito bowl", unit: "piece", display_name: "burrito bowl", source: "web_research", components: [
            { food_key: "white rice cooked", unit: "per_100g", quantity: 150 },
            { food_key: "paneer tikka air fried", unit: "per_100g", quantity: 80 },
          ] }],
        ),
    });
    expect(web).not.toHaveBeenCalled();
    expect(r!.source).toBe("food_db");
    expect(r!.items.map((i) => [i.name, i.calories])).toEqual([
      ["paratha · 2 pieces", 520],
      ["white rice cooked · 150 g", 195],
      ["paneer tikka air fried · 80 g", 208],
      ["curd · 100 g", 60],
    ]);
    expect(r!.calories).toBe(983);
  });

  it("converts grams to pieces when the piece weight is known", async () => {
    const r = await estimateWithFoodDb("160g paratha", null, { ...quiet, load: async () => tables([food("paratha", "piece", 260, 6, 80)]) });
    expect(r!.calories).toBe(520);
  });

  it("sends only unseen items to the web, saves ingredients in their own units and the dish breakdown", async () => {
    const saveFoods = vi.fn().mockResolvedValue(undefined);
    const saveRecipes = vi.fn().mockResolvedValue(undefined);
    const breakdown: Breakdown = {
      items: new Map([[1, [
        { food: "White rice, cooked", unit: "per_100g", quantity: 150, per_unit: { calories: 130, protein_g: 2.7, carbs_g: 28, fat_g: 0.3 }, grams_per_unit: null },
        { food: "Egg, boiled", unit: "piece", quantity: 2, per_unit: { calories: 78, protein_g: 6.3, carbs_g: 0.6, fat_g: 5.3 }, grams_per_unit: 50 },
      ]]]),
      serving_assumption: "One bowl.",
      citations: [],
      web_search_requests: 1,
    };
    const web = vi.fn().mockResolvedValue(breakdown);
    const r = await estimateWithFoodDb("2 parathas and egg rice bowl", web, {
      ...quiet,
      load: async () => tables([food("paratha", "piece", 260, 6, 80)]),
      saveFoods,
      saveRecipes,
    });
    expect(web).toHaveBeenCalledWith("2 parathas and egg rice bowl", [{ index: 1, phrase: "egg rice bowl (no amount given)" }], []);
    expect(r!.calories).toBe(520 + 195 + 156);
    await new Promise((res) => setTimeout(res, 0));
    expect((saveFoods.mock.calls[0]![0] as FoodRow[]).map((f) => [f.food_key, f.unit, f.calories, f.grams_per_unit])).toEqual([
      ["white rice cooked", "per_100g", 130, null],
      ["egg boiled", "piece", 78, 50],
    ]);
    expect(saveRecipes.mock.calls[0]![0]).toMatchObject([
      { dish_key: "egg rice bowl", unit: "serving", components: [
        { food_key: "white rice cooked", unit: "per_100g", quantity: 150 },
        { food_key: "egg boiled", unit: "piece", quantity: 2 },
      ] },
    ]);
  });

  it("reuses a stored ingredient's numbers over a new web value", async () => {
    const web = vi.fn().mockResolvedValue({
      items: new Map([[1, [{ food: "Paratha", unit: "piece", quantity: 2, per_unit: { calories: 300, protein_g: 5, carbs_g: 0, fat_g: 0 }, grams_per_unit: 90 }]]]),
      serving_assumption: null, citations: [], web_search_requests: 1,
    });
    // Stored per piece; asked in bowls, so it isn't resolved from the table directly.
    const saveRecipes = vi.fn().mockResolvedValue(undefined);
    const r = await estimateWithFoodDb("1 plate paratha", web, {
      ...quiet,
      load: async () => tables([food("paratha", "piece", 260, 6, 80)]),
      saveFoods: vi.fn().mockResolvedValue(undefined),
      saveRecipes,
    });
    expect(r!.calories).toBe(520);
  });

  it("returns null when the web breakdown fails", async () => {
    expect(await estimateWithFoodDb("poha", vi.fn().mockResolvedValue(null), { ...quiet, load: async () => tables([]) })).toBeNull();
  });
});

describe("unit matching", () => {
  it("treats 'egg' (a serving) and '1 egg' (a piece) alike", async () => {
    const r = await estimateWithFoodDb("egg", null, { ...quiet, load: async () => tables([food("egg", "piece", 78, 6.3)]) });
    expect(r!.calories).toBe(78);
  });
});
