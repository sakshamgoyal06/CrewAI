import { beforeEach, describe, expect, it, vi } from "vitest";

const web = vi.hoisted(() => ({ estimateViaWebResearch: vi.fn() }));
vi.mock("./providers/webResearchEstimate.js", () => web);
vi.mock("./providers/usdaFdc.js", () => ({ estimateViaUsdaFdc: vi.fn().mockResolvedValue(null) }));
vi.mock("./providers/calorieNinjas.js", () => ({ estimateViaCalorieNinjas: vi.fn().mockResolvedValue(null) }));
vi.mock("./foodStore.js", () => ({
  lookupFoods: vi.fn().mockResolvedValue(new Map()),
  findFood: (rows: Map<string, unknown>, k: string, u: string) => rows.get(`${k}|${u}`),
  saveFoods: vi.fn().mockResolvedValue(undefined),
  markFoodsUsed: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("./providers/llmEstimate.js", () => ({ estimateViaLlm: vi.fn().mockResolvedValue(null) }));

import { clearEstimateCache, estimateCacheKey, estimateMealNutrition } from "./estimateMealNutrition.js";

const found = {
  calories: 420, protein_g: 12, carbs_g: 60, fat_g: 14, items: [], source: "web_research" as const, serving_assumption: null,
};

beforeEach(() => {
  clearEstimateCache();
  web.estimateViaWebResearch.mockReset();
});

describe("estimateMealNutrition cache", () => {
  it("answers a repeated meal from cache without another web search", async () => {
    web.estimateViaWebResearch.mockResolvedValue(found);
    await estimateMealNutrition("2 Paratha and baingan sabzi");
    const again = await estimateMealNutrition("2 paratha  and baingan sabzi!");
    expect(again).toEqual(found);
    expect(web.estimateViaWebResearch).toHaveBeenCalledTimes(1);
  });

  it("does not cache a failed estimate", async () => {
    web.estimateViaWebResearch.mockResolvedValueOnce(null).mockResolvedValueOnce(found);
    expect((await estimateMealNutrition("poha")).source).toBe("unavailable");
    expect((await estimateMealNutrition("poha")).calories).toBe(420);
  });

  it("keeps portions in the key", () => {
    expect(estimateCacheKey("2 rotis")).not.toBe(estimateCacheKey("3 rotis"));
    expect(estimateCacheKey("1.5 cups rice")).toBe("1.5 cups rice");
  });
});
