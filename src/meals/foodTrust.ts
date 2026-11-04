/**
 * Which shared food rows a person may use (see the poisoning guard in foodStore.ts). Kept free of
 * database imports so the estimator's tests can mock the store and still use these.
 */
import type { FoodRow, FoodTables, RecipeRow } from "./foodStore.js";

/** A row made by a lookup no one else has confirmed yet; used only for its contributor. */
export const PENDING_SOURCE = "web_pending";
export const CONFIRMED_SOURCE = "web_research";

/** Who is logging a meal. `trusted` (the owner) skips the pending stage. */
export type FoodContributor = { id: string; trusted: boolean };

const rowKey = (key: string, unit: string): string => `${key}|${unit}`;

/**
 * Splits loaded rows into what this person may use and other people's pending rows (kept aside to
 * check a fresh lookup against). Without a viewer, nobody's pending rows are used.
 */
export function splitPending(
  tables: FoodTables,
  viewerId: string | null | undefined,
): { visible: FoodTables; pendingFoods: Map<string, FoodRow>; pendingRecipes: Map<string, RecipeRow> } {
  const mine = (r: { source: string; contributor?: string | null }) =>
    r.source !== PENDING_SOURCE || (!!viewerId && r.contributor === viewerId);
  const visible: FoodTables = { foods: new Map(), recipes: new Map() };
  const pendingFoods = new Map<string, FoodRow>();
  const pendingRecipes = new Map<string, RecipeRow>();
  for (const [key, rows] of tables.foods) {
    const ok = rows.filter(mine);
    if (ok.length) visible.foods.set(key, ok);
    for (const r of rows) if (!mine(r)) pendingFoods.set(rowKey(r.food_key, r.unit), r);
  }
  for (const [key, r] of tables.recipes) (mine(r) ? visible.recipes : pendingRecipes).set(key, r);
  return { visible, pendingFoods, pendingRecipes };
}

