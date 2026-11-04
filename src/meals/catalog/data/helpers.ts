/** Compact builders for catalog data files. */
import type { CatalogDish, CatalogFood, Category, Diet, Serving, ServingSize, ServingUnit, Source } from "../types.js";

export const usda = (description: string): Source => ({ kind: "usda", usda: description });
export const ref = (note: string): Source => ({ kind: "reference", note });
export const label = (note: string): Source => ({ kind: "label", note });

/** A serving: `s("piece", 40, "medium", true)` = one medium piece of 40 g, the default. */
export function s(unit: ServingUnit, grams: number, size?: ServingSize | null, isDefault?: boolean, text?: string): Serving {
  return {
    unit,
    grams,
    ...(size ? { size } : {}),
    ...(isDefault ? { default: true } : {}),
    ...(text ? { label: text } : {}),
  };
}

type Opts = { aliases?: string[]; basis?: "100ml" };

/** [kcal, protein, carbs, fat, fiber] per 100 g (or 100 ml). */
export type M = [number, number, number, number, number];

export function food(
  name: string,
  category: Category,
  diet: Diet,
  m: M,
  source: Source,
  servings: Serving[],
  opts: Opts = {},
): CatalogFood {
  const [kcal, protein, carbs, fat, fiber] = m;
  return { name, category, diet, per100: { kcal, protein, carbs, fat, fiber }, source, servings, ...opts };
}

export function dish(
  name: string,
  category: Category,
  diet: Diet,
  recipe: [string, number][],
  cookedGrams: number,
  servings: Serving[],
  opts: Opts & { note?: string } = {},
): CatalogDish {
  return { name, category, diet, recipe, cookedGrams, servings, ...opts };
}

/** Common measures. */
export const KATORI = (grams = 150, isDefault = true): Serving => s("bowl", grams, null, isDefault, "1 katori");
export const PER100 = (isDefault = true): Serving => s("serving", 100, null, isDefault, "100 g");
