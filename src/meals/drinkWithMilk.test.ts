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

describe("additions after 'and', and milk in a black drink", () => {
  it("sugar after 'tea with milk and' is the chai's own sugar", async () => {
    expect(await names("tea with milk and sugar")).toEqual(["Chai"]);
    expect(await names("coffee with milk and sugar")).toEqual(["Coffee"]);
  });

  it("milk in black coffee or tea is a splash, not a glass", async () => {
    const r = await estimateWithFoodDb("black coffee with milk", null);
    expect(r?.items?.map((i) => i.name)).toEqual(["Black coffee · 1 cup · 200 ml", "Toned milk · 30 ml"]);
    expect(await names("black coffee with milk and sugar")).toEqual(["Black coffee", "Toned milk", "Sugar"]);
    expect(await names("black coffee with sugar and milk")).toEqual(["Black coffee", "Sugar", "Toned milk"]);
    const splash = (await estimateWithFoodDb("black coffee with sugar and milk", null))?.items?.[2]?.name;
    expect(splash).toBe("Toned milk · 30 ml");
  });

  it("a food after the additions is its own item; a glass of milk with an amount stays", async () => {
    expect(await names("chai with sugar and biscuit")).toEqual(["Chai", "Glucose biscuit"]);
    expect(await names("chai with biscuit, milk")).toEqual(["Chai", "Glucose biscuit", "Toned milk"]);
    expect(await names("black coffee with 1 glass milk")).toEqual(["Black coffee", "Toned milk"]);
    const glass = (await estimateWithFoodDb("black coffee with 1 glass milk", null))?.items?.[1]?.name;
    expect(glass).toContain("250 ml");
  });
});

describe("two names for one food", () => {
  it("'1 scoop (33 g) whey protein powder (MuscleBlaze)' is one scoop, not two", async () => {
    const r = await estimateWithFoodDb("1 scoop (33 g) whey protein powder (MuscleBlaze)", null);
    expect(r?.items?.map((i) => i.name)).toEqual(["Whey protein · 1 scoop · 30 g"]);
  });

  it("still splits two different foods typed together", async () => {
    expect((await names("fish curry roti"))?.length).toBe(2);
  });
});
