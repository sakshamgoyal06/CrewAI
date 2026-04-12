import { describe, expect, it } from "vitest";

import { extractLeadingGrams, normalizeQueryForCalorieNinjas } from "./mealPortionParse.js";

describe("normalizeQueryForCalorieNinjas", () => {
  it("normalizes gm to g", () => {
    expect(normalizeQueryForCalorieNinjas("30gm chhole masala")).toBe("30g chhole masala");
  });
});

describe("extractLeadingGrams", () => {
  it("reads grams with various units", () => {
    expect(extractLeadingGrams("30gm chhole")).toBe(30);
    expect(extractLeadingGrams("30 g rice")).toBe(30);
    expect(extractLeadingGrams("1.5 grams salt")).toBe(1.5);
  });

  it("returns null when no quantity", () => {
    expect(extractLeadingGrams("chhole masala")).toBeNull();
  });
});
