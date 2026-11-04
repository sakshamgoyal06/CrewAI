/**
 * Quality gate for the food catalog. Every batch the food DB agent adds must pass these
 * (docs/FOOD_DB.md). A failure names the food and the rule it broke.
 */
import { describe, expect, it } from "vitest";

import { foodKeyFor } from "../foodParse.js";
import { buildCatalog, servingId } from "./index.js";
import { DISHES, ORDERED, PREP } from "./data/dishes.js";
import { FOODS, NOT_JAIN } from "./data/foods.js";
import type { CatalogDish, CatalogFood, ServingUnit } from "./types.js";

const cat = buildCatalog();
const all: (CatalogFood | CatalogDish)[] = [...FOODS, ...DISHES];

/** Plausible weight of one measure, in grams (ml). Pieces and plates vary too much per food. */
const UNIT_RANGE: Partial<Record<ServingUnit, [number, number]>> = {
  bowl: [25, 300],
  cup: [10, 260],
  glass: [150, 350],
  ladle: [40, 100],
  tbsp: [5, 25],
  tsp: [2, 8],
  handful: [8, 40],
  scoop: [20, 45],
  plate: [150, 450],
  slice: [5, 300],
  piece: [0.5, 400],
  serving: [10, 400],
};

describe("food catalog", () => {
  it("builds (every dish ingredient exists)", () => {
    expect(cat.entries.length).toBe(FOODS.length + DISHES.length);
  });

  it("has no duplicate names, and no alias that points at two foods", () => {
    const seen = new Map<string, string>();
    const clashes: string[] = [];
    for (const f of all) {
      for (const k of [f.name, ...(f.aliases ?? [])].map(foodKeyFor)) {
        const other = seen.get(k);
        if (other && other !== f.name) clashes.push(`"${k}" → ${other} and ${f.name}`);
        seen.set(k, f.name);
      }
    }
    expect(clashes).toEqual([]);
  });

  it("numbers are physically possible", () => {
    const bad = cat.entries.filter((e) => {
      const p = e.per100;
      const vals = [p.kcal, p.protein, p.carbs, p.fat, p.fiber];
      return vals.some((v) => !Number.isFinite(v) || v < 0) || p.kcal > 900 || p.protein + p.carbs + p.fat > 100.5 || p.fiber > p.carbs + 0.5;
    });
    expect(bad.map((e) => e.name)).toEqual([]);
  });

  it("calories match the Atwater sum (4·protein + 4·net carbs + 2·fibre + 9·fat) within 15% (or 10 kcal)", () => {
    // USDA uses food-specific factors and counts organic acids, so small foods drift a little.
    const off = cat.entries
      .map((e) => {
        const p = e.per100;
        const atwater = 4 * p.protein + 4 * Math.max(0, p.carbs - p.fiber) + 2 * p.fiber + 9 * p.fat;
        return { name: e.name, kcal: p.kcal, atwater: Math.round(atwater) };
      })
      .filter((x) => Math.abs(x.kcal - x.atwater) > Math.max(10, 0.15 * x.kcal));
    expect(off).toEqual([]);
  });

  it("every food has exactly one default serving and plausible weights", () => {
    const problems: string[] = [];
    for (const f of all) {
      const defaults = f.servings.filter((s) => s.default).length;
      if (!f.servings.length) problems.push(`${f.name}: no servings`);
      if (f.servings.length && defaults > 1) problems.push(`${f.name}: ${defaults} defaults`);
      for (const s of f.servings) {
        const r = UNIT_RANGE[s.unit];
        if (!(s.grams > 0) || (r && (s.grams < r[0] || s.grams > r[1]))) problems.push(`${f.name}: ${s.unit} ${s.grams} g`);
      }
      const sized = f.servings.filter((s) => s.size);
      for (const u of new Set(sized.map((s) => s.unit))) {
        const bySize = Object.fromEntries(f.servings.filter((s) => s.unit === u && s.size).map((s) => [s.size, s.grams]));
        if ((bySize.small ?? 0) > (bySize.medium ?? Infinity) || (bySize.medium ?? 0) > (bySize.large ?? Infinity)) {
          problems.push(`${f.name}: ${u} sizes out of order`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it("serving ids are unique within each food (plans reference them)", () => {
    const dupes = cat.entries.flatMap((e) => {
      const ids = e.servings.map((s) => servingId(e.key, s));
      return ids.filter((id, i) => ids.indexOf(id) !== i);
    });
    expect(dupes).toEqual([]);
  });

  it("every dish has a prep time, and the prep list names only real dishes", () => {
    expect(cat.entries.filter((e) => e.kind === "dish" && e.prepMinutes === null).map((e) => e.name)).toEqual([]);
    const names = new Set(DISHES.map((d) => d.name));
    expect(Object.keys(PREP).filter((n) => !names.has(n))).toEqual([]);
  });

  it("marks bought or ordered food, which always has prep 0, and names only real dishes", () => {
    const names = new Set(DISHES.map((d) => d.name));
    expect(ORDERED.filter((n) => !names.has(n))).toEqual([]);
    const ordered = cat.entries.filter((e) => e.ordered);
    expect(ordered.length).toBeGreaterThanOrEqual(ORDERED.length);
    expect(ordered.filter((e) => e.prepMinutes !== 0).map((e) => e.name)).toEqual([]);
    expect(cat.entries.find((e) => e.name === "Dal tadka")!.ordered).toBe(false);
  });

  it("works out which food is Jain from its ingredients", () => {
    const foodNames = new Set(FOODS.map((x) => x.name));
    expect(NOT_JAIN.filter((n) => !foodNames.has(n))).toEqual([]);
    const jain = (n: string) => cat.entries.find((e) => e.name === n)!.jain;
    expect(["Jain dal tadka", "Jain paneer sabzi", "Jain chole", "Jain rajma", "Besan gatte ki sabzi", "Lauki chana dal", "Jain kadhi", "Dal dhokli", "Roti", "Paneer"].filter((n) => !jain(n))).toEqual([]);
    expect(["Dal tadka", "Aloo paratha", "Onion", "Egg, boiled", "Chicken curry", "Pav bhaji"].filter(jain)).toEqual([]);
  });

  it("every dish has at least one meal type", () => {
    expect(cat.entries.filter((e) => e.kind === "dish" && !e.meals.length).map((e) => e.name)).toEqual([]);
  });

  it("every whole food names its source", () => {
    expect(FOODS.filter((f) => !f.source || (f.source.kind === "usda" ? !f.source.usda : !f.source.note)).map((f) => f.name)).toEqual([]);
  });

  it("dish recipes are sane: positive amounts, cooked weight within 0.4–6× the ingredients", () => {
    const bad = DISHES.filter((d) => {
      const raw = d.recipe.reduce((a, [, g]) => a + g, 0);
      return d.recipe.some(([, g]) => !(g > 0)) || d.cookedGrams < raw * 0.4 || d.cookedGrams > raw * 6;
    });
    expect(bad.map((d) => d.name)).toEqual([]);
  });
});
