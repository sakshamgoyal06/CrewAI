import { beforeEach, describe, expect, it, vi } from "vitest";

const web = vi.hoisted(() => ({ estimateViaWebResearch: vi.fn() }));
vi.mock("./providers/webResearchEstimate.js", () => web);
vi.mock("./providers/usdaFdc.js", () => ({ estimateViaUsdaFdc: vi.fn().mockResolvedValue(null) }));
vi.mock("./providers/calorieNinjas.js", () => ({ estimateViaCalorieNinjas: vi.fn().mockResolvedValue(null) }));
// Ingredient path covered in foodDbEstimate.test.ts; here it finds nothing and never calls the web.
vi.mock("./foodDbEstimate.js", () => ({ estimateWithFoodDb: vi.fn().mockResolvedValue(null) }));
vi.mock("./providers/webBreakdown.js", () => ({ breakdownViaWebResearch: vi.fn() }));
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

describe("web lookup cap and per-person cache", () => {
  it("skips the web when the person's lookups are used up", async () => {
    const onWebLookup = vi.fn();
    const r = await estimateMealNutrition("poha", { webAllowed: false, onWebLookup });
    expect(r.source).toBe("unavailable");
    expect(web.estimateViaWebResearch).not.toHaveBeenCalled();
    expect(onWebLookup).not.toHaveBeenCalled();
  });

  it("counts each web lookup", async () => {
    web.estimateViaWebResearch.mockResolvedValue(found);
    const onWebLookup = vi.fn();
    await estimateMealNutrition("poha", { onWebLookup });
    expect(onWebLookup).toHaveBeenCalledTimes(1);
  });

  it("never serves one person's web result to another", async () => {
    web.estimateViaWebResearch.mockResolvedValue(found);
    await estimateMealNutrition("poha", { contributor: { id: "a", trusted: false } });
    await estimateMealNutrition("poha", { contributor: { id: "a", trusted: false } });
    expect(web.estimateViaWebResearch).toHaveBeenCalledTimes(1);
    await estimateMealNutrition("poha", { contributor: { id: "b", trusted: false } });
    expect(web.estimateViaWebResearch).toHaveBeenCalledTimes(2);
  });
});

describe("web-first lookup (Can't find it? Search)", () => {
  it("goes to the web instead of rebuilding the dish from the food table", async () => {
    const { estimateWithFoodDb } = await import("./foodDbEstimate.js");
    const db = vi.mocked(estimateWithFoodDb);
    db.mockClear();
    db.mockResolvedValue({ ...found, calories: 50, source: "food_db" as never });
    // Logging "boondi raita" normally comes back as the table's plain raita…
    expect((await estimateMealNutrition("boondi raita")).calories).toBe(50);
    // …but the search screen asks the web, and doesn't reuse that cached answer.
    web.estimateViaWebResearch.mockResolvedValue({ ...found, calories: 160 });
    const onWebLookup = vi.fn();
    const r = await estimateMealNutrition("boondi raita", { webFirst: true, onWebLookup });
    expect(r.calories).toBe(160);
    expect(onWebLookup).toHaveBeenCalledTimes(1);
    expect(db).toHaveBeenCalledTimes(1);
    db.mockResolvedValue(null);
  });

  it("uses the usual order when the person's web lookups are used up", async () => {
    const r = await estimateMealNutrition("boondi raita", { webFirst: true, webAllowed: false });
    expect(web.estimateViaWebResearch).not.toHaveBeenCalled();
    expect(r.source).toBe("unavailable");
  });
});
