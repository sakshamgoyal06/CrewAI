/**
 * Read/write for our own food database:
 * - `food_nutrition`: one ingredient/variant per row, nutrition per its natural unit
 *   (per 100 g / 100 ml, per piece, per slice …).
 * - `food_recipes`: what a dish or portion is made of, as ingredient amounts per one unit of it.
 * Every failure here is soft: the estimator just falls back to the web.
 */
import { logger } from "../logger.js";
import { supabase } from "../tools/clients.js";
import type { FoodUnit } from "./foodParse.js";

export type FoodRow = {
  food_key: string;
  unit: FoodUnit;
  display_name: string;
  grams_per_unit: number | null;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  source: string;
  source_detail?: Record<string, unknown>;
};

/** One ingredient line of a recipe; `quantity` is grams/ml for the per-100 units. */
export type RecipeComponent = { food_key: string; unit: FoodUnit; quantity: number };

export type RecipeRow = {
  dish_key: string;
  unit: FoodUnit;
  display_name: string;
  components: RecipeComponent[];
  source: string;
  source_detail?: Record<string, unknown>;
};

export type FoodTables = {
  /** All units stored for a food, keyed by food_key. */
  foods: Map<string, FoodRow[]>;
  /** Keyed by `dish_key|unit`. */
  recipes: Map<string, RecipeRow>;
};

const FOOD_COLUMNS = "food_key, unit, display_name, grams_per_unit, calories, protein_g, carbs_g, fat_g, source";

export const recipeKey = (dishKey: string, unit: string): string => `${dishKey}|${unit}`;

function toFoodRow(r: Record<string, unknown>): FoodRow {
  return {
    food_key: String(r.food_key),
    unit: r.unit as FoodUnit,
    display_name: String(r.display_name),
    grams_per_unit: r.grams_per_unit === null || r.grams_per_unit === undefined ? null : Number(r.grams_per_unit),
    calories: Number(r.calories),
    protein_g: Number(r.protein_g),
    carbs_g: Number(r.carbs_g),
    fat_g: Number(r.fat_g),
    source: String(r.source),
  };
}

async function selectFoods(keys: string[]): Promise<FoodRow[]> {
  if (!keys.length) return [];
  const { data, error } = await supabase.from("food_nutrition").select(FOOD_COLUMNS).in("food_key", keys);
  if (error) {
    logger.warn({ error: error.message }, "food db lookup failed");
    return [];
  }
  return (data ?? []).map((r) => toFoodRow(r as Record<string, unknown>));
}

/**
 * Foods and recipes for these keys, plus the ingredients those recipes use, in two round trips.
 */
export async function loadFoodTables(keys: string[]): Promise<FoodTables> {
  const wanted = [...new Set(keys)].filter(Boolean);
  const out: FoodTables = { foods: new Map(), recipes: new Map() };
  if (!wanted.length) return out;

  const [foods, recipes] = await Promise.all([
    selectFoods(wanted),
    supabase
      .from("food_recipes")
      .select("dish_key, unit, display_name, components, source")
      .in("dish_key", wanted)
      .then(({ data, error }) => {
        if (error) logger.warn({ error: error.message }, "food recipe lookup failed");
        return (data ?? []) as RecipeRow[];
      }),
  ]);
  for (const r of recipes) {
    if (Array.isArray(r.components)) out.recipes.set(recipeKey(r.dish_key, r.unit), r);
  }
  const have = new Set(foods.map((f) => f.food_key));
  const ingredientKeys = [...new Set(recipes.flatMap((r) => (r.components ?? []).map((c) => c.food_key)))].filter(
    (k) => !have.has(k),
  );
  for (const f of [...foods, ...(await selectFoods(ingredientKeys))]) {
    out.foods.set(f.food_key, [...(out.foods.get(f.food_key) ?? []), f]);
  }
  return out;
}

/** Names already in the table, most used first, so the estimator reuses them. */
export async function knownFoodNames(limit = 150): Promise<string[]> {
  const { data, error } = await supabase
    .from("food_nutrition")
    .select("display_name, hits")
    .order("hits", { ascending: false })
    .limit(limit);
  if (error) return [];
  return [...new Set((data ?? []).map((r) => String(r.display_name)))];
}

/** First value stored for a food and unit stays (stable numbers); new foods are added. */
export async function saveFoods(rows: FoodRow[]): Promise<void> {
  if (!rows.length) return;
  const unique = new Map(rows.map((r) => [`${r.food_key}|${r.unit}`, { ...r, source_detail: r.source_detail ?? {} }]));
  const { error } = await supabase
    .from("food_nutrition")
    .upsert([...unique.values()], { onConflict: "food_key,unit", ignoreDuplicates: true });
  if (error) logger.warn({ error: error.message }, "food db save failed");
}

/** A dish's breakdown is refreshed by the latest lookup. */
export async function saveRecipes(rows: RecipeRow[]): Promise<void> {
  if (!rows.length) return;
  const now = new Date().toISOString();
  const unique = new Map(rows.map((r) => [recipeKey(r.dish_key, r.unit), { ...r, source_detail: r.source_detail ?? {}, updated_at: now }]));
  const { error } = await supabase.from("food_recipes").upsert([...unique.values()], { onConflict: "dish_key,unit" });
  if (error) logger.warn({ error: error.message }, "food recipe save failed");
}

/** Usage counter on ingredient rows; fire-and-forget. */
export async function markFoodsUsed(rows: Pick<FoodRow, "food_key" | "unit">[]): Promise<void> {
  if (!rows.length) return;
  const { error } = await supabase.rpc("food_nutrition_mark_used", {
    p_keys: rows.map((r) => r.food_key),
    p_units: rows.map((r) => r.unit),
  });
  if (error) logger.debug({ error: error.message }, "food db hit counter failed");
}
