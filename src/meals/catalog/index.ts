/**
 * Loads the catalog once, computes dish numbers from their recipes, and resolves a logged item
 * ("2 medium roti", "half katori dal", "150 g paneer") to grams of one catalog food.
 */
import { foodKeyFor, type FoodComponent } from "../foodParse.js";
import { DISHES } from "./data/dishes.js";
import { FOODS, NOT_JAIN } from "./data/foods.js";
import { CUISINE, POPULARITY } from "./data/ranking.js";
import type { Category, CatalogDish, CatalogFood, Cuisine, Macros, MealType, PrepMinutes, Serving, ServingSize, ServingUnit } from "./types.js";

export type CatalogEntry = {
  /** Stable id: the normalized name ("dal tadka"). Plans and logs may reference it. */
  key: string;
  name: string;
  kind: "food" | "dish";
  basis: "100g" | "100ml";
  per100: Macros;
  servings: Serving[];
  diet: CatalogFood["diet"];
  category: CatalogFood["category"];
  meals: MealType[];
  /** Minutes to make at home (0, 10, 20, 30 = 30+); null for ingredients that aren't eaten alone. */
  prepMinutes: PrepMinutes | null;
  /** Usually bought or ordered, not made at home; prepMinutes 0 then means "no prep", not "home-made in 0 min". */
  ordered: boolean;
  /** Fits a Jain diet: vegetarian, with no onion, garlic, root vegetables, mushroom or honey (data/foods.ts NOT_JAIN). */
  jain: boolean;
  /** How often people log it, 1 (rare) to 5 (most days); a judged prior (data/ranking.ts). */
  popularity: 1 | 2 | 3 | 4 | 5;
  /** Regional or style group for grouping search results. */
  cuisine: Cuisine;
  /** Normalized aliases that point at this entry (search matches them). */
  aliases: string[];
  /** A dish's ingredient keys ("chai" → toned milk, sugar); empty for a plain food. */
  contains: string[];
};

const popularityOf = (name: string, meals: MealType[]): CatalogEntry["popularity"] => POPULARITY[name] ?? (meals.length ? 2 : 1);
const cuisineOf = (name: string): Cuisine => CUISINE[name] ?? "everyday";

/** Whole foods that are eaten as they are. */
const READY: Category[] = ["fruit", "dairy", "nut_seed", "drink", "supplement", "sweet"];
const foodPrep = (f: CatalogFood): PrepMinutes | null =>
  f.prepMinutes ?? (READY.includes(f.category) && (f.meals ?? MEALS_BY_CATEGORY[f.category]).length ? 0 : null);

const MAINS: MealType[] = ["lunch", "dinner"];
/** Usual meals per category; an entry's own `meals` wins. Ingredients get none. */
export const MEALS_BY_CATEGORY: Record<Category, MealType[]> = {
  grain: [], bread: ["breakfast", "lunch", "dinner"], pulse: [], vegetable: [], spice_condiment: [], fat_oil: [],
  sugar_sweetener: [], meat: [], fish: [],
  fruit: ["breakfast", "snack"], dairy: ["breakfast", "snack"], egg: ["breakfast", "lunch", "dinner"],
  nut_seed: ["breakfast", "snack"], drink: ["breakfast", "snack"], supplement: ["breakfast", "snack"],
  dal_curry: MAINS, sabzi: MAINS, rice_dish: MAINS, meal: MAINS,
  breakfast: ["breakfast", "snack"], snack: ["snack", "breakfast"], sweet: ["snack"],
};

/** Stable serving id: "roti:piece:medium", "dal tadka:bowl". */
export function servingId(key: string, s: Serving): string {
  return [key, s.unit, s.size].filter(Boolean).join(":");
}

export type CatalogMatch = {
  entry: CatalogEntry;
  /** Total grams (ml) eaten. */
  grams: number;
  /** "1 katori · 150 g", "2 medium roti · 80 g", "150 g". */
  amount: string;
};

const ZERO: Macros = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
const round1 = (n: number): number => Math.round(n * 10) / 10;

/** Generic weights when a food has no measure of that kind (liquids and cooked foods ≈ 1 g/ml). */
const GENERIC_GRAMS: Partial<Record<ServingUnit, number>> = {
  bowl: 150,
  cup: 240,
  glass: 250,
  ladle: 60,
  tbsp: 15,
  tsp: 5,
};
const SIZE_FACTOR: Record<ServingSize, number> = { small: 0.75, medium: 1, large: 1.33 };

export function dishPer100(dish: CatalogDish, foods: Map<string, CatalogEntry>): Macros {
  const total = { ...ZERO };
  for (const [name, grams] of dish.recipe) {
    const f = foods.get(foodKeyFor(name));
    if (!f) throw new Error(`dish "${dish.name}" uses unknown ingredient "${name}"`);
    for (const k of Object.keys(total) as (keyof Macros)[]) total[k] += (f.per100[k] * grams) / 100;
  }
  const scale = 100 / dish.cookedGrams;
  return {
    kcal: Math.round(total.kcal * scale),
    protein: round1(total.protein * scale),
    carbs: round1(total.carbs * scale),
    fat: round1(total.fat * scale),
    fiber: round1(total.fiber * scale),
  };
}

export type Catalog = {
  entries: CatalogEntry[];
  /** Canonical key and every alias key → entry. */
  byKey: Map<string, CatalogEntry>;
};

export function buildCatalog(foods: CatalogFood[] = FOODS, dishes: CatalogDish[] = DISHES): Catalog {
  const entries: CatalogEntry[] = [];
  const byKey = new Map<string, CatalogEntry>();
  const ingredients = new Map<string, CatalogEntry>();
  const add = (e: CatalogEntry, aliases: string[] | undefined) => {
    entries.push(e);
    for (const k of [e.key, ...(aliases ?? []).map(foodKeyFor)]) {
      if (!k || byKey.has(k)) continue;
      byKey.set(k, e);
      if (k !== e.key) e.aliases.push(k);
    }
  };
  for (const f of foods) {
    const e: CatalogEntry = {
      key: foodKeyFor(f.name), name: f.name, kind: "food", basis: f.basis ?? "100g", per100: f.per100,
      servings: f.servings, diet: f.diet, category: f.category, meals: f.meals ?? MEALS_BY_CATEGORY[f.category], prepMinutes: foodPrep(f), ordered: f.ordered ?? false,
      jain: f.diet !== "egg" && f.diet !== "nonveg" && !NOT_JAIN.includes(f.name),
      popularity: popularityOf(f.name, f.meals ?? MEALS_BY_CATEGORY[f.category]), cuisine: cuisineOf(f.name), aliases: [], contains: [],
    };
    ingredients.set(e.key, e);
    add(e, f.aliases);
  }
  // Dishes may use earlier dishes ("rajma chawal" = rajma + rice), so order matters.
  for (const d of dishes) {
    const e: CatalogEntry = {
      key: foodKeyFor(d.name), name: d.name, kind: "dish", basis: d.basis ?? "100g", per100: dishPer100(d, ingredients),
      servings: d.servings, diet: d.diet, category: d.category, meals: d.meals ?? MEALS_BY_CATEGORY[d.category], prepMinutes: d.prepMinutes ?? null, ordered: d.ordered ?? false,
      jain: d.diet !== "egg" && d.diet !== "nonveg" && d.recipe.every(([n]) => ingredients.get(foodKeyFor(n))?.jain === true),
      popularity: popularityOf(d.name, d.meals ?? MEALS_BY_CATEGORY[d.category]), cuisine: cuisineOf(d.name), aliases: [],
      contains: [...new Set(d.recipe.flatMap(([n]) => { const k = foodKeyFor(n); return [k, ...(ingredients.get(k)?.contains ?? [])]; }))],
    };
    ingredients.set(e.key, e);
    add(e, d.aliases);
  }
  return { entries, byKey };
}

let cached: Catalog | null = null;
export function catalog(): Catalog {
  cached ??= buildCatalog();
  return cached;
}

export function lookupFood(key: string, cat: Catalog = catalog()): CatalogEntry | undefined {
  return cat.byKey.get(key);
}

export function servingLabel(s: Serving): string {
  if (s.label) return s.label;
  const unit = s.unit === "bowl" ? "katori" : s.unit;
  return s.size ? `${s.size} ${unit === "piece" ? "" : unit}`.trim() : unit;
}

function pickServing(entry: CatalogEntry, unit: ServingUnit, size: ServingSize | undefined): Serving | null {
  const of = entry.servings.filter((s) => s.unit === unit);
  if (!of.length) return null;
  return (
    (size && of.find((s) => s.size === size)) ||
    of.find((s) => s.default) ||
    of.find((s) => s.size === "medium") ||
    of[0]!
  );
}

export function defaultServing(entry: CatalogEntry): Serving {
  return entry.servings.find((s) => s.default) ?? entry.servings[0]!;
}

function fmtQty(q: number): string {
  return q === 0.5 ? "½" : q === 0.25 ? "¼" : String(Math.round(q * 100) / 100);
}

/** Grams for one logged item, or null when the unit doesn't fit this food. */
export function resolveCatalogItem(c: FoodComponent, cat: Catalog = catalog()): CatalogMatch | null {
  const entry = lookupFood(c.foodKey, cat);
  if (!entry || !entry.servings.length) return null;
  const unitName = entry.basis === "100ml" ? "ml" : "g";

  if (c.unit === "per_100g" || c.unit === "per_100ml") {
    return { entry, grams: c.quantity, amount: `${Math.round(c.quantity)} ${c.unit === "per_100ml" ? "ml" : "g"}` };
  }

  let serving: Serving | null = null;
  if (c.assumedQuantity || c.unit === "serving") {
    const d = defaultServing(entry);
    serving = (c.size && pickServing(entry, d.unit, c.size)) || d;
  } else if (c.unit === "piece") {
    // "2 idli" counts pieces; "1 poha" means one of its usual measure.
    serving = pickServing(entry, "piece", c.size) ?? defaultServing(entry);
  } else {
    serving = pickServing(entry, c.unit as ServingUnit, c.size);
    if (!serving && c.unit === "plate") {
      // "1 plate dosa", "half plate chole" when the food has no plate measure: a plate is about
      // one and a half katori of a katori food, two of a piece food (dosa, paratha, samosa), or
      // one usual serving of anything else.
      const d = defaultServing(entry);
      const factor = d.unit === "bowl" ? 1.5 : d.unit === "piece" ? 2 : 1;
      serving = { unit: "plate", grams: Math.round(d.grams * factor), label: "1 plate" };
    }
    if (!serving) {
      const generic = GENERIC_GRAMS[c.unit as ServingUnit];
      if (!generic) return null;
      serving = { unit: c.unit as ServingUnit, grams: generic };
    }
  }

  // A size word with no measure of that size scales the usual one ("large katori dal").
  const scale = c.size && serving.size !== c.size ? SIZE_FACTOR[c.size] : 1;
  const grams = round1(serving.grams * scale * c.quantity);
  const base = servingLabel(scale !== 1 ? { ...serving, size: undefined, label: serving.label?.replace(/^1\s+(small|medium|large)\s+/, "1 ") } : serving);
  const label = (scale !== 1 ? `${c.size} ` : "") + base.replace(/^1\s+/, "");
  return { entry, grams, amount: `${fmtQty(c.quantity)} ${label} · ${Math.round(grams)} ${unitName}` };
}

/** Macros for a match. */
export function matchMacros(m: CatalogMatch): Macros {
  const f = m.grams / 100;
  const p = m.entry.per100;
  return {
    kcal: Math.round(p.kcal * f),
    protein: round1(p.protein * f),
    carbs: round1(p.carbs * f),
    fat: round1(p.fat * f),
    fiber: round1(p.fiber * f),
  };
}
