/**
 * Read/write for our own food database (`food_nutrition`): nutrition per food per unit.
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

const COLUMNS = "food_key, unit, display_name, grams_per_unit, calories, protein_g, carbs_g, fat_g, source";

const keyOf = (foodKey: string, unit: string): string => `${foodKey}|${unit}`;

/** All rows for these foods, keyed by `food_key|unit`. */
export async function lookupFoods(foodKeys: string[]): Promise<Map<string, FoodRow>> {
  const out = new Map<string, FoodRow>();
  const keys = [...new Set(foodKeys)].filter(Boolean);
  if (!keys.length) return out;
  const { data, error } = await supabase.from("food_nutrition").select(COLUMNS).in("food_key", keys);
  if (error) {
    logger.warn({ error: error.message }, "food db lookup failed");
    return out;
  }
  for (const r of data ?? []) {
    const row: FoodRow = {
      food_key: String(r.food_key),
      unit: r.unit as FoodUnit,
      display_name: String(r.display_name),
      grams_per_unit: r.grams_per_unit === null ? null : Number(r.grams_per_unit),
      calories: Number(r.calories),
      protein_g: Number(r.protein_g),
      carbs_g: Number(r.carbs_g),
      fat_g: Number(r.fat_g),
      source: String(r.source),
    };
    out.set(keyOf(row.food_key, row.unit), row);
  }
  return out;
}

export function findFood(rows: Map<string, FoodRow>, foodKey: string, unit: string): FoodRow | undefined {
  return rows.get(keyOf(foodKey, unit));
}

/** Insert or refresh rows (newest lookup wins for the same food and unit). */
export async function saveFoods(rows: FoodRow[]): Promise<void> {
  if (!rows.length) return;
  const now = new Date().toISOString();
  const unique = new Map(rows.map((r) => [keyOf(r.food_key, r.unit), r]));
  const { error } = await supabase
    .from("food_nutrition")
    .upsert(
      [...unique.values()].map((r) => ({ ...r, source_detail: r.source_detail ?? {}, updated_at: now })),
      { onConflict: "food_key,unit" },
    );
  if (error) logger.warn({ error: error.message }, "food db save failed");
}

/** Usage counter; fire-and-forget. */
export async function markFoodsUsed(rows: FoodRow[]): Promise<void> {
  if (!rows.length) return;
  const { error } = await supabase.rpc("food_nutrition_mark_used", {
    p_keys: rows.map((r) => r.food_key),
    p_units: rows.map((r) => r.unit),
  });
  if (error) logger.debug({ error: error.message }, "food db hit counter failed");
}
