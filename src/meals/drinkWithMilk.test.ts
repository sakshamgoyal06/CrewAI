/**
 * 6 Nov: "Add a tea in today's breakfast" became "1 cup of tea with milk", which was split into
 * chai plus a whole glass of toned milk (230 kcal). Chai already has its milk.
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

import { estimateWithFoodDb } from "./foodDbEstimate.js";

const names = async (text: string) => (await estimateWithFoodDb(text, null))?.items?.map((i) => i.name.split(" · ")[0]);

describe("a drink 'with' what it already has", () => {
  it("tea with milk is one cup of chai, not chai plus a glass of milk", async () => {
    expect(await names("1 cup of tea with milk")).toEqual(["Chai"]);
    expect(await names("tea with milk")).toEqual(["Chai"]);
    expect(await names("chai with sugar")).toEqual(["Chai"]);
    expect(await names("coffee with milk")).toEqual(["Coffee"]);
  });

  it("keeps an addition with its own amount, or one the dish doesn't have", async () => {
    expect(await names("coffee with 1 glass milk")).toEqual(["Coffee", "Toned milk"]);
    expect(await names("aloo paratha with curd")).toEqual(["Aloo paratha", "Curd"]);
  });
});
