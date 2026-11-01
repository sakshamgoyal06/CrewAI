import { describe, expect, it, vi } from "vitest";

vi.mock("./foodStore.js", () => ({
  lookupFoods: vi.fn(),
  findFood: (rows: Map<string, unknown>, k: string, u: string) => rows.get(`${k}|${u}`),
  saveFoods: vi.fn(),
  markFoodsUsed: vi.fn(),
}));

import { estimateWithFoodDb, rowsFromWebItem } from "./foodDbEstimate.js";
import { parseFoodPhrase } from "./foodParse.js";
import type { FoodRow } from "./foodStore.js";

const row = (food_key: string, unit: FoodRow["unit"], calories: number, protein_g = 0): FoodRow => ({
  food_key, unit, display_name: food_key, grams_per_unit: null, calories, protein_g, carbs_g: 0, fat_g: 0, source: "web_research",
});
const table = (...rows: FoodRow[]) => new Map(rows.map((r) => [`${r.food_key}|${r.unit}`, r]));

describe("estimateWithFoodDb", () => {
  it("answers fully from the table without the web", async () => {
    const web = vi.fn();
    const markUsed = vi.fn().mockResolvedValue(undefined);
    const r = await estimateWithFoodDb("2 parathas and 100g curd", web, {
      lookup: async () => table(row("paratha", "piece", 260, 6), row("curd", "per_100g", 60, 3.5)),
      markUsed,
    });
    expect(web).not.toHaveBeenCalled();
    expect(r).toMatchObject({ source: "food_db", calories: 580, protein_g: 15.5 });
    expect(r!.items.map((i) => i.calories)).toEqual([520, 60]);
    expect(markUsed).toHaveBeenCalledTimes(1);
  });

  it("asks the web only for the missing food and saves it per unit and per 100 g", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const web = vi.fn().mockResolvedValue({
      calories: 180, protein_g: 4, carbs_g: 14, fat_g: 12, source: "web_research", serving_assumption: "1 bowl ≈ 150 g.",
      providerRaw: {}, items: [{ name: "baingan sabzi", component_index: 1, grams: 150, calories: 180, protein_g: 4, carbs_g: 14, fat_g: 12 }],
    });
    const r = await estimateWithFoodDb("2 parathas and a bowl of baingan sabzi", web, {
      lookup: async () => table(row("paratha", "piece", 260, 6)),
      save,
      markUsed: vi.fn().mockResolvedValue(undefined),
    });
    expect(web).toHaveBeenCalledWith("2 parathas and a bowl of baingan sabzi", [{ index: 1, name: "baingan sabzi", amount: "1 bowl" }]);
    expect(r).toMatchObject({ source: "web_research", calories: 700 });
    expect(r!.serving_assumption).toContain("From your food database: parathas (2 piece).");
    const saved = save.mock.calls[0]![0] as FoodRow[];
    expect(saved.map((s) => [s.food_key, s.unit, s.calories, s.grams_per_unit])).toEqual([
      ["baingan sabzi", "bowl", 180, 150],
      ["baingan sabzi", "per_100g", 120, null],
    ]);
  });

  it("falls back (null) when the web fails and some foods were known", async () => {
    const r = await estimateWithFoodDb("2 parathas and dal", vi.fn().mockResolvedValue(null), {
      lookup: async () => table(row("paratha", "piece", 260)),
    });
    expect(r).toBeNull();
  });

  it("stores per-100 g rows scaled from the amount eaten", () => {
    const c = parseFoodPhrase("150g paneer")!;
    expect(rowsFromWebItem(c, { name: "paneer", calories: 400, protein_g: 27 }, {})).toMatchObject([
      { food_key: "paneer", unit: "per_100g", calories: 266.7, protein_g: 18 },
    ]);
  });
});
