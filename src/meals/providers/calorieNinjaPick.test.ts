import { describe, expect, it } from "vitest";

import {
  calorieNinjaLineRelevanceScore,
  narrowCalorieNinjaLinesToBestMatch,
} from "./calorieNinjaPick.js";

const line = (
  name: string,
  cal: number,
  serving = 100,
): Parameters<typeof narrowCalorieNinjaLinesToBestMatch>[1][number] => ({
  name,
  calories: cal,
  protein_g: 1,
  carbs_g: 10,
  fat_g: 1,
  serving_size_g: serving,
});

describe("narrowCalorieNinjaLinesToBestMatch", () => {
  it("keeps the line whose name best matches a single-phrase query", () => {
    const out = narrowCalorieNinjaLinesToBestMatch("chhole masala", [
      line("masala", 50),
      line("chhole masala", 400),
      line("curry sauce", 30),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.name).toBe("chhole masala");
  });

  it("does not narrow when the query lists multiple foods", () => {
    const rows = [line("rice", 130), line("lentils", 116)];
    const out = narrowCalorieNinjaLinesToBestMatch("100g rice, 30g dal", rows);
    expect(out).toBe(rows);
    expect(out).toHaveLength(2);
  });

  it("strips leading grams when scoring so the dish name still matches", () => {
    const out = narrowCalorieNinjaLinesToBestMatch("250g chhole masala", [
      line("chickpea", 200),
      line("chhole masala", 380),
    ]);
    expect(out[0]!.name).toBe("chhole masala");
  });
});

describe("calorieNinjaLineRelevanceScore", () => {
  it("ranks full dish name above generic tokens", () => {
    const sShort = calorieNinjaLineRelevanceScore("chhole masala", "masala");
    const sFull = calorieNinjaLineRelevanceScore("chhole masala", "chhole masala");
    expect(sFull).toBeGreaterThan(sShort);
  });
});
