/**
 * Foods the coach already read from the message are looked up one by one, as given: catalog
 * (by key, then search), food table, web. No text splitting, no extra model call.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("./foodStore.js", () => ({
  loadFoodTables: vi.fn(async () => ({ foods: new Map(), recipes: new Map() })),
  knownFoodNames: vi.fn(async () => []),
  recipeKey: (k: string, u: string) => `${k}|${u}`,
  saveFoods: vi.fn(),
  saveRecipes: vi.fn(),
  markFoodsUsed: vi.fn(),
}));
vi.mock("./foodGaps.js", () => ({ recordFoodGaps: vi.fn(async () => {}) }));

import { componentFromItem, estimateFromItems, type ParsedFoodItem } from "./foodDbEstimate.js";

const names = async (items: ParsedFoodItem[], breakdown: any = null) =>
  (await estimateFromItems("meal", items, breakdown))?.items?.map((i) => i.name.split(" · ")[0]) ?? null;

describe("estimateFromItems", () => {
  // 6 Nov: "Add a tea in today's breakfast" became chai plus a glass of milk.
  it("a tea is one cup of chai, found by search", async () => {
    expect(await names([{ food: "tea" }])).toEqual(["Chai"]);
  });

  it("uses amounts and units as given", async () => {
    const r = await estimateFromItems("meal", [{ food: "roti", quantity: 2 }, { food: "paneer", quantity: 100, unit: "g" }], null);
    expect(r?.items?.map((i) => i.name)).toEqual([expect.stringMatching(/^Roti · 2/), "Paneer · 100 g"]);
  });

  it("a detail that names its own food picks it", async () => {
    expect(await names([{ food: "chai", notes: "no sugar" }])).toEqual(["Chai without sugar"]);
  });

  it("an unknown dish goes to the web lookup, not a lookalike", async () => {
    const breakdown = vi.fn(async () => null);
    expect(await names([{ food: "veg whopper" }], breakdown)).toBeNull();
    expect(breakdown).toHaveBeenCalledWith("meal", [{ index: 1, phrase: "veg whopper (no amount given)" }], []);
  });

  it("never splits an item, and a detail it can't match leaves the food as is", async () => {
    expect(await names([{ food: "tea", notes: "with milk" }])).toEqual(["Chai"]);
    expect(componentFromItem({ food: "aloo paratha", quantity: 2 })).toMatchObject({ foodKey: "aloo paratha", quantity: 2, unit: "piece", assumedQuantity: false });
  });
});
