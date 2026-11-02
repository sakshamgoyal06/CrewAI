import { describe, expect, it, vi } from "vitest";

vi.mock("../tools/clients.js", () => ({ supabase: {}, redis: {}, anthropic: {} }));

import { parseMealComponents } from "./foodParse.js";
import { seedRows } from "./indianFoodSeed.js";

describe("Indian food seed", () => {
  const rows = seedRows();

  it("has macros that add up to the calories (within 15%)", () => {
    const off = rows.filter((r) => {
      const fromMacros = 4 * r.protein_g + 4 * r.carbs_g + 9 * r.fat_g;
      return r.calories > 50 && Math.abs(fromMacros - r.calories) / r.calories > 0.15;
    });
    expect(off.map((r) => `${r.display_name} ${r.unit}: ${r.calories} vs ${Math.round(4 * r.protein_g + 4 * r.carbs_g + 9 * r.fat_g)}`)).toEqual([]);
  });

  it("has one row per food and unit", () => {
    const keys = rows.map((r) => `${r.food_key}|${r.unit}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("matches how people write their meals", () => {
    const keys = new Set(rows.map((r) => `${r.food_key}|${r.unit}`));
    for (const c of parseMealComponents("2 rotis, a bowl of dal, 1 katori rajma, 100g paneer, 2 idlis, a glass of milk")) {
      expect(keys.has(`${c.foodKey}|${c.unit}`), `${c.phrase} → ${c.foodKey}|${c.unit}`).toBe(true);
    }
  });
});
