import { describe, expect, it } from "vitest";

import { catalog } from "../../meals/catalog/index.js";
import { composeOptions, nameRestrictionCheck, restrictionCheck } from "./compose.js";
import { applyEdit, editInput, searchMealFoods, servingFor } from "./edit.js";
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

  it("gives each serving a one-portion item with numbers", () => {
    const [dal] = searchMealFoods("dal tadka", "lunch", anyFood);
    expect(dal!.servings.length).toBeGreaterThan(0);
    for (const s of dal!.servings) {
      expect(s.item.qty).toBe(1);
      expect(s.item.kcal).toBeGreaterThan(0);
      expect(s.item.servingId).toBe(s.id);
    }
  });

  it("adds a food the catalog doesn't have, with its own numbers (web lookup)", () => {
    const fali = { name: "Fali sabzi", kcal: 120, proteinG: 4, carbsG: 10, fatG: 7 };
    const input = editInput.parse({ items: [{ custom: fali, qty: 1.5 }] });
    const r = applyEdit([], input, anyFood);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.items[0]).toMatchObject({ key: null, servingId: null, name: "Fali sabzi", text: "1.5 × Fali sabzi", kcal: 180, proteinG: 6 });
    expect(r.totals.kcal).toBe(180);
  });

  it("checks a web food's name against the diet and foods to avoid", () => {
    const veg = nameRestrictionCheck({ diet: "vegetarian", avoid: ["peanut"] });
    const custom = (name: string) => editInput.parse({ items: [{ custom: { name, kcal: 200, proteinG: 5, carbsG: 20, fatG: 8 }, qty: 1 }] });
    expect(applyEdit([], custom("Boondi raita"), anyFood, catalog(), veg).ok).toBe(true);
    expect(applyEdit([], custom("Chicken momos"), anyFood, catalog(), veg)).toMatchObject({ ok: false, error: "not_allowed" });
    expect(applyEdit([], custom("Peanut chikki"), anyFood, catalog(), veg)).toMatchObject({ ok: false, error: "not_allowed" });
    expect(applyEdit([], custom("Egg curry"), anyFood, catalog(), nameRestrictionCheck({ diet: "eggetarian", avoid: [] })).ok).toBe(true);
  });

  it("rejects a custom food with markup or silly numbers", () => {
    expect(editInput.safeParse({ items: [{ custom: { name: "<script>x</script>", kcal: 100, proteinG: 1, carbsG: 1, fatG: 1 }, qty: 1 }] }).success).toBe(false);
    expect(editInput.safeParse({ items: [{ custom: { name: "Rice", kcal: 99999, proteinG: 1, carbsG: 1, fatG: 1 }, qty: 1 }] }).success).toBe(false);
  });
});
