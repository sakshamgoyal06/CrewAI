import { describe, expect, it } from "vitest";

import { dietPrefsInput } from "./prefs.js";
import { budgetsAfterSupplements, supplementChoices, supplementLines, supplementTotals } from "./supplements.js";
import { macroTargets, mealBudgets } from "./targets.js";

const budgets = () => mealBudgets(macroTargets({ calories: 2000, proteinG: 200, weightKg: 75 }), { breakfast: 25, lunch: 35, snack: 10, dinner: 30 });

describe("supplements", () => {
  it("offers catalog supplements, whey first", () => {
    const names = supplementChoices().map((c) => c.name);
    expect(names).toContain("Whey protein");
    expect(names).toContain("Creatine");
    expect(names[0]).toBe("Whey protein");
  });

  it("works out a scoop of whey from the catalog and ignores unknown names", () => {
    const lines = supplementLines([{ name: "whey", servings: 2 }, { name: "mystery powder", servings: 1 }, { name: "Dal tadka", servings: 1 }]);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ name: "Whey protein", servings: 2, kcal: 240 });
    expect(lines[0]!.proteinG).toBeCloseTo(48, 0);
  });

  it("zero-calorie supplements add nothing", () => {
    expect(supplementTotals(supplementLines([{ name: "creatine", servings: 1 }, { name: "multivitamin", servings: 1 }])).kcal).toBe(0);
  });

  it("takes whey out of its own meal when it has a slot, and spreads it otherwise", () => {
    const base = budgets();
    const lines = supplementLines([{ name: "Whey protein", servings: 1, slot: "breakfast" }]);
    const own = budgetsAfterSupplements(base, lines);
    expect(own[0]!.proteinG).toBe(base[0]!.proteinG - 24);
    expect(own[1]).toEqual(base[1]);
    const spread = budgetsAfterSupplements(base, supplementLines([{ name: "Whey protein", servings: 1 }]));
    const lost = base.reduce((a, b) => a + b.proteinG, 0) - spread.reduce((a, b) => a + b.proteinG, 0);
    expect(Math.abs(lost - 24)).toBeLessThanOrEqual(2);
  });

  it("never squeezes a meal below 40% of its budget", () => {
    const base = budgets();
    const big = budgetsAfterSupplements(base, supplementLines([{ name: "Mass gainer", servings: 4, slot: "snack" }]));
    expect(big[2]!.calories).toBe(Math.round(base[2]!.calories * 0.4));
  });

  it("old saved setups without supplements still load", () => {
    const p = dietPrefsInput.parse({ meals: [{ slot: "lunch", share: 70 }] });
    expect(p.supplements).toEqual([]);
  });
});
