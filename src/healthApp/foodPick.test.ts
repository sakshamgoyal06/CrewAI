import { describe, expect, it } from "vitest";

import { searchFoods } from "./foodPick.js";

describe("searchFoods", () => {
  it("finds a food with household servings and macros per serving", () => {
    const hits = searchFoods("roti");
    expect(hits.length).toBeGreaterThan(0);
    const roti = hits.find((h) => h.key === "chapati" || /roti/.test(h.key))!;
    expect(roti.servings.some((s) => s.default)).toBe(true);
    expect(roti.servings[0]!.kcal).toBeGreaterThan(0);
  });
  it("lists popular foods for an empty search and nothing for nonsense", () => {
    expect(searchFoods("").length).toBeGreaterThan(5);
    expect(searchFoods("zzzxqv")).toEqual([]);
  });
});
