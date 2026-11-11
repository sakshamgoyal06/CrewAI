import { describe, expect, it } from "vitest";
// @ts-expect-error plain JS module from the PWA
import { amountOf, canWeigh, dbItem, gramItem, logItem, parseGrams, toGrams, totalsOf } from "../../pwa/mealbuilder.js";

// Paneer: 265 kcal / 18.3 P / 1.2 C / 20.8 F per 100 g, as the catalog stores it.
const paneer = {
  key: "paneer",
  name: "paneer",
  servings: [
    { id: "paneer:katori", label: "1 katori", grams: 80, default: true, kcal: 212, proteinG: 14.6, carbsG: 1, fatG: 16.6, fiberG: 0 },
    { id: "paneer:100g", label: "100 g", grams: 100, default: false, kcal: 265, proteinG: 18.3, carbsG: 1.2, fatG: 20.8, fiberG: 0 },
  ],
};
const savedFood = {
  key: "mine:1",
  name: "Protein bar",
  servings: [{ id: "mine:1", label: "1 serving", grams: 0, default: true, kcal: 200, proteinG: 20, carbsG: 20, fatG: 6, fiberG: 0 }],
};

describe("parseGrams", () => {
  it("reads a weight before or after the food", () => {
    expect(parseGrams("150g paneer")).toEqual({ grams: 150, q: "paneer" });
    expect(parseGrams("150 g of paneer")).toEqual({ grams: 150, q: "paneer" });
    expect(parseGrams("200 gm rice")).toEqual({ grams: 200, q: "rice" });
    expect(parseGrams("curd 250 grams")).toEqual({ grams: 250, q: "curd" });
    expect(parseGrams("milk 300ml")).toEqual({ grams: 300, q: "milk" });
  });
  it("leaves counts and plain names alone", () => {
    expect(parseGrams("2 roti")).toBeNull();
    expect(parseGrams("paneer")).toBeNull();
    expect(parseGrams("150g")).toBeNull();
    expect(parseGrams("5000 g rice")).toBeNull();
  });
});

describe("weighed foods", () => {
  it("scales the catalog numbers to the grams eaten", () => {
    const it150 = gramItem(paneer, paneer.servings[0], 150);
    expect(amountOf(it150)).toBe("150 g");
    expect(logItem(it150)).toEqual({ name: "150 g paneer", calories: 398, protein_g: 27.4, carbs_g: 1.9, fat_g: 31.1 });
  });
  it("gives the same numbers whichever serving it starts from", () => {
    const a = logItem(gramItem(paneer, paneer.servings[0], 120));
    const b = logItem(gramItem(paneer, paneer.servings[1], 120));
    expect(Math.abs(a.calories - b.calories)).toBeLessThanOrEqual(1);
  });
  it("switches a serving line to grams at what it weighed", () => {
    const two = dbItem(paneer, paneer.servings[0], 2);
    const g = toGrams(two);
    expect(g.byGram).toBe(true);
    expect(g.qty).toBe(160);
    expect(logItem(g).calories).toBe(logItem(two).calories);
  });
  it("adds into the meal totals like any other line", () => {
    const t = totalsOf([gramItem(paneer, paneer.servings[1], 100), dbItem(paneer, paneer.servings[1], 1)]);
    expect(t.kcal).toBe(530);
  });
  it("can't weigh a saved food with no known weight", () => {
    expect(canWeigh(dbItem(savedFood, savedFood.servings[0]))).toBe(false);
    expect(gramItem(savedFood, savedFood.servings[0], 100)).toBeNull();
    expect(canWeigh(dbItem(paneer, paneer.servings[0]))).toBe(true);
  });
  it("keeps a typed weight within 1 g to 2 kg", () => {
    expect(gramItem(paneer, paneer.servings[0], 0.2).qty).toBe(1);
    expect(gramItem(paneer, paneer.servings[0], 9000).qty).toBe(2000);
  });
});
