import { describe, expect, it } from "vitest";

import { catalog } from "../../meals/catalog/index.js";
import { composeOptions, restrictionCheck } from "./compose.js";
import { applyEdit, searchMealFoods, servingFor } from "./edit.js";
import { DEFAULT_SHARES, macroTargets, mealBudgets } from "./targets.js";

const lunch = () => {
  const b = mealBudgets(macroTargets({ calories: 2100, proteinG: 150, weightKg: 80 }), DEFAULT_SHARES).find((x) => x.slot === "lunch")!;
  return composeOptions({ budget: b, diet: "vegetarian", avoid: [], loves: [], staples: "roti", prepLimit: null })[0]!;
};
const anyFood = () => true;
const firstServing = (name: string) => searchMealFoods(name, "lunch", anyFood)[0]!.servings[0]!.id;

describe("editing a planned meal", () => {
  it("keeps, re-portions and drops planned items", () => {
    const o = lunch();
    const r = applyEdit(o.items, { items: [{ keep: 0, qty: o.items[0]!.qty * 2 }] }, anyFood);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.items).toHaveLength(1);
    expect(r.items[0]!.kcal).toBeGreaterThan(o.items[0]!.kcal * 1.8);
    expect(r.totals.kcal).toBe(r.items[0]!.kcal);
  });

  it("adds a catalog food at the chosen portion, with its numbers from the catalog", () => {
    const o = lunch();
    const id = firstServing("curd");
    const r = applyEdit(o.items, { items: [...o.items.map((i, k) => ({ keep: k, qty: i.qty })), { servingId: id, qty: 2 }] }, anyFood);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const added = r.items.at(-1)!;
    const one = servingFor(id)!;
    expect(added.key).toBe(one.e.key);
    expect(added.grams).toBe(Math.round(one.s.grams * 2));
    expect(r.totals.kcal).toBeGreaterThan(o.totals.kcal);
  });

  it("refuses a food the person's restrictions rule out", () => {
    const veg = restrictionCheck({ diet: "vegetarian", avoid: [] });
    const id = firstServing("butter chicken");
    expect(applyEdit([], { items: [{ servingId: id, qty: 1 }] }, veg)).toMatchObject({ ok: false, error: "not_allowed" });
  });

  it("refuses unknown items and foods", () => {
    expect(applyEdit([], { items: [{ keep: 3, qty: 1 }] }, anyFood)).toMatchObject({ ok: false, error: "unknown_item" });
    expect(applyEdit([], { items: [{ servingId: "no such food:bowl", qty: 1 }] }, anyFood)).toMatchObject({ ok: false, error: "unknown_food" });
  });
});

describe("food search in the meal editor", () => {
  it("suggests foods for the meal before anything is typed", () => {
    const hits = searchMealFoods("", "breakfast", anyFood);
    expect(hits.length).toBeGreaterThan(5);
    const cat = catalog();
    for (const h of hits) expect(cat.byKey.get(h.key)!.meals).toContain("breakfast");
  });

  it("leaves out what the diet, the avoid list and the meat limits rule out", () => {
    const veg = restrictionCheck({ diet: "vegetarian", avoid: [] });
    expect(searchMealFoods("chicken", "dinner", veg).every((h) => catalog().byKey.get(h.key)!.diet !== "nonveg")).toBe(true);
    const noPaneer = restrictionCheck({ diet: "vegetarian", avoid: ["paneer"] });
    expect(searchMealFoods("paneer", "dinner", noPaneer)).toHaveLength(0);
    const onlyChicken = restrictionCheck({ diet: "non_vegetarian", avoid: [], dietNote: ["Only chicken and eggs in non veg"] });
    const meat = searchMealFoods("mutton", "dinner", onlyChicken);
    expect(meat.some((h) => /mutton/.test(h.key))).toBe(false);
    expect(searchMealFoods("chicken", "dinner", onlyChicken).length).toBeGreaterThan(0);
  });

  it("searches the whole list when logging: no meal given, no restriction applied", () => {
    const hits = searchMealFoods("chicken", undefined, anyFood);
    expect(hits.length).toBeGreaterThan(0);
    expect(searchMealFoods("", undefined, anyFood).length).toBeGreaterThan(5);
  });

  it("gives each serving a one-portion item with numbers", () => {
    const [dal] = searchMealFoods("dal tadka", "lunch", anyFood);
    expect(dal!.servings.length).toBeGreaterThan(0);
    for (const s of dal!.servings) {
      expect(s.item.qty).toBe(1);
      expect(s.item.kcal).toBeGreaterThan(0);
      expect(s.item.servingId).toBe(s.id);
    }
  });
});
