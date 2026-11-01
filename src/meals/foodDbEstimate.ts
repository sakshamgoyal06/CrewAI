/**
 * Meals are built up from ingredients in our own food database, like HealthifyMe.
 *
 * "2 parathas, a burrito bowl" → each item is resolved to ingredient amounts:
 *   - an ingredient stored in the unit used ("paratha" per piece → 2 piece), or
 *   - a stored recipe for the dish ("burrito bowl" serving → 150 g white rice cooked + …).
 * Items we can't resolve go to one web lookup that breaks them into ingredients with nutrition
 * per natural unit (per 100 g, per piece, per slice …). New ingredients and dish breakdowns are
 * saved, so the same food never needs the web again. Totals are always the sum of ingredients.
 */
import { amountLabel, foodKeyFor, parseMealComponents, type FoodComponent, type FoodUnit } from "./foodParse.js";
import {
  knownFoodNames,
  loadFoodTables,
  markFoodsUsed,
  recipeKey,
  saveFoods,
  saveRecipes,
  type FoodRow,
  type FoodTables,
  type RecipeRow,
} from "./foodStore.js";
import type { Breakdown, BreakdownRequestItem } from "./providers/webBreakdown.js";
import type { MealItemLine, MealNutritionEstimate } from "./types.js";

/** An ingredient amount: `quantity` in the row's unit (grams/ml for the per-100 units). */
export type IngredientLine = { row: FoodRow; quantity: number };

const r1 = (n: number): number => Math.round(n * 10) / 10;
const isPer100 = (u: FoodUnit): boolean => u === "per_100g" || u === "per_100ml";

function rowFor(tables: FoodTables, foodKey: string, unit: FoodUnit): FoodRow | undefined {
  return tables.foods.get(foodKey)?.find((r) => r.unit === unit);
}

/** Ingredient lines for one meal item from stored data, or null when something is missing. */
export function resolveFromTables(c: FoodComponent, tables: FoodTables): IngredientLine[] | null {
  for (const unit of unitCandidates(c.unit)) {
    const lines = resolveInUnit({ ...c, unit }, tables);
    if (lines) return lines;
  }
  return null;
}

/** "a burrito bowl" (one piece) and "burrito bowl" (one serving) mean the same thing. */
function unitCandidates(u: FoodUnit): FoodUnit[] {
  if (u === "piece") return ["piece", "serving"];
  if (u === "serving") return ["serving", "piece"];
  return [u];
}

function resolveInUnit(c: FoodComponent, tables: FoodTables): IngredientLine[] | null {
  // 1. The food itself, in the unit given ("2 parathas" → paratha per piece).
  const same = rowFor(tables, c.foodKey, c.unit);
  if (same) return [{ row: same, quantity: c.quantity }];
  // Grams given for a food stored per piece/slice with a known weight ("120 g paratha").
  if (c.unit === "per_100g") {
    const counted = tables.foods.get(c.foodKey)?.find((r) => !isPer100(r.unit) && r.grams_per_unit);
    if (counted) return [{ row: counted, quantity: c.quantity / counted.grams_per_unit! }];
  }
  // 2. A stored breakdown of the dish in that unit ("burrito bowl" serving, "dal" bowl).
  const recipe = tables.recipes.get(recipeKey(c.foodKey, c.unit));
  if (!recipe || !recipe.components.length) return null;
  const factor = isPer100(c.unit) ? c.quantity / 100 : c.quantity;
  const lines: IngredientLine[] = [];
  for (const comp of recipe.components) {
    const row = rowFor(tables, comp.food_key, comp.unit);
    if (!row) return null;
    lines.push({ row, quantity: comp.quantity * factor });
  }
  return lines;
}

export function lineMacros(l: IngredientLine) {
  const f = isPer100(l.row.unit) ? l.quantity / 100 : l.quantity;
  return {
    calories: r1(l.row.calories * f),
    protein_g: r1(l.row.protein_g * f),
    carbs_g: r1(l.row.carbs_g * f),
    fat_g: r1(l.row.fat_g * f),
  };
}

function lineLabel(l: IngredientLine): string {
  const q = Math.round(l.quantity * 10) / 10;
  if (l.row.unit === "per_100g") return `${l.row.display_name} · ${Math.round(l.quantity)} g`;
  if (l.row.unit === "per_100ml") return `${l.row.display_name} · ${Math.round(l.quantity)} ml`;
  return `${l.row.display_name} · ${q} ${l.row.unit}${q === 1 ? "" : l.row.unit === "glass" ? "es" : "s"}`;
}

/** Turns a web breakdown of one item into ingredient lines (reusing stored rows) + rows to save. */
export function linesFromBreakdown(
  c: FoodComponent,
  ingredients: NonNullable<ReturnType<Breakdown["items"]["get"]>>,
  tables: FoodTables,
  detail: Record<string, unknown>,
): { lines: IngredientLine[]; newFoods: FoodRow[]; recipe: RecipeRow | null } {
  const lines: IngredientLine[] = [];
  const newFoods: FoodRow[] = [];
  for (const ing of ingredients) {
    const key = foodKeyFor(ing.food);
    if (!key) continue;
    // Keep numbers stable: an ingredient already in the table wins over a fresh web value.
    let row = rowFor(tables, key, ing.unit);
    if (!row) {
      row = {
        food_key: key,
        unit: ing.unit,
        display_name: ing.food,
        grams_per_unit: ing.grams_per_unit,
        ...ing.per_unit,
        source: "web_research",
        source_detail: detail,
      };
      newFoods.push(row);
      tables.foods.set(key, [...(tables.foods.get(key) ?? []), row]);
    }
    lines.push({ row, quantity: ing.quantity });
  }
  const selfOnly = lines.length === 1 && lines[0]!.row.food_key === c.foodKey && lines[0]!.row.unit === c.unit;
  const per = isPer100(c.unit) ? 100 / c.quantity : 1 / c.quantity;
  const recipe: RecipeRow | null =
    selfOnly || !lines.length
      ? null
      : {
          dish_key: c.foodKey,
          unit: c.unit,
          display_name: c.name,
          components: lines.map((l) => ({ food_key: l.row.food_key, unit: l.row.unit, quantity: r1(l.quantity * per) })),
          source: "web_research",
          source_detail: detail,
        };
  return { lines, newFoods, recipe };
}

export type BreakdownFn = (mealText: string, items: BreakdownRequestItem[], known: string[]) => Promise<Breakdown | null>;

export type FoodDbDeps = {
  load?: typeof loadFoodTables;
  known?: typeof knownFoodNames;
  saveFoods?: typeof saveFoods;
  saveRecipes?: typeof saveRecipes;
  markUsed?: typeof markFoodsUsed;
};

/**
 * Estimate built from ingredients; null when an item can't be resolved (the caller then runs
 * the whole-meal fallbacks).
 */
export async function estimateWithFoodDb(
  text: string,
  breakdown: BreakdownFn | null,
  deps: FoodDbDeps = {},
): Promise<MealNutritionEstimate | null> {
  const comps = parseMealComponents(text);
  if (comps.length === 0 || comps.length > 12) return null;

  const tables = await (deps.load ?? loadFoodTables)(comps.map((c) => c.foodKey));
  const resolved = comps.map((c) => resolveFromTables(c, tables));
  const missing = comps.map((_, i) => i).filter((i) => resolved[i] === null);
  const fromDbCount = comps.length - missing.length;

  const created = new Set<FoodRow>();
  let assumption: string | null = null;
  let providerRaw: Record<string, unknown> = { food_db_items: fromDbCount };

  if (missing.length) {
    if (!breakdown) return null;
    const known = await (deps.known ?? knownFoodNames)().catch(() => [] as string[]);
    const asked = missing.map((i, n) => ({
      index: n + 1,
      phrase: comps[i]!.assumedQuantity ? `${comps[i]!.phrase} (no amount given)` : comps[i]!.phrase,
    }));
    const res = await breakdown(text, asked, known);
    if (!res || asked.some((a) => !res.items.get(a.index)?.length)) return null;

    const detail = { meal_text: text.slice(0, 300), serving_assumption: res.serving_assumption, citations: res.citations };
    const newFoods: FoodRow[] = [];
    const recipes: RecipeRow[] = [];
    missing.forEach((ci, n) => {
      const out = linesFromBreakdown(comps[ci]!, res.items.get(n + 1)!, tables, detail);
      resolved[ci] = out.lines;
      newFoods.push(...out.newFoods);
      out.newFoods.forEach((f) => created.add(f));
      if (out.recipe) recipes.push(out.recipe);
    });
    if (resolved.some((r) => !r?.length)) return null;
    // Foods first so a recipe never points at an ingredient that failed to save.
    void (deps.saveFoods ?? saveFoods)(newFoods)
      .then(() => (deps.saveRecipes ?? saveRecipes)(recipes))
      .catch(() => undefined);
    assumption = res.serving_assumption;
    providerRaw = {
      ...providerRaw,
      search_provider: "anthropic_web_search",
      web_search_requests: res.web_search_requests,
      citations: res.citations,
      food_db_new_foods: newFoods.length,
      food_db_new_recipes: recipes.length,
    };
  }

  const lines = resolved.flatMap((r) => r ?? []);
  const stored = lines.filter((l) => !created.has(l.row));
  if (stored.length) void (deps.markUsed ?? markFoodsUsed)(stored.map((l) => l.row)).catch(() => undefined);

  const items: MealItemLine[] = lines.map((l) => ({ name: lineLabel(l), ...lineMacros(l) }));
  const sum = (k: "calories" | "protein_g" | "carbs_g" | "fat_g"): number => r1(items.reduce((s, it) => s + (it[k] ?? 0), 0));
  const note = [
    `Built from ${lines.length} ingredient${lines.length === 1 ? "" : "s"}${fromDbCount ? `; ${fromDbCount} of ${comps.length} item${comps.length === 1 ? "" : "s"} from your food database` : ""}.`,
    assumption,
  ]
    .filter(Boolean)
    .join(" ");

  return {
    calories: sum("calories"),
    protein_g: sum("protein_g"),
    carbs_g: sum("carbs_g"),
    fat_g: sum("fat_g"),
    items,
    source: missing.length ? "web_research" : "food_db",
    serving_assumption: note,
    providerRaw: { ...providerRaw, items: comps.map((c) => `${c.name} (${amountLabel(c)})`) },
  };
}
