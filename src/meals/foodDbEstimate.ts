/**
 * Our food database first, the web only for foods we haven't seen.
 *
 * The meal is split into components ("2 parathas", "a bowl of baingan sabzi"). Each one found in
 * `food_nutrition` is answered from there instantly. The rest go to one web search together, and
 * their numbers are saved per unit (and per 100 g when the weight is known) for next time.
 */
import { logger } from "../logger.js";
import { amountLabel, parseMealComponents, type FoodComponent } from "./foodParse.js";
import { findFood, lookupFoods, markFoodsUsed, saveFoods, type FoodRow } from "./foodStore.js";
import type { MealItemLine, MealNutritionEstimate } from "./types.js";
import type { WebComponent } from "./providers/webResearchEstimate.js";

type Macros = { calories: number; protein_g: number; carbs_g: number; fat_g: number };

const r1 = (n: number): number => Math.round(n * 10) / 10;
const scale = (m: Macros, f: number): Macros => ({
  calories: r1(m.calories * f),
  protein_g: r1(m.protein_g * f),
  carbs_g: r1(m.carbs_g * f),
  fat_g: r1(m.fat_g * f),
});

/** Numbers for what was eaten, from stored rows; null when the food or unit isn't stored. */
export function macrosFromRows(c: FoodComponent, rows: Map<string, FoodRow>): { macros: Macros; row: FoodRow } | null {
  if (c.unit === "per_100g" || c.unit === "per_100ml") {
    const row = findFood(rows, c.foodKey, c.unit);
    return row ? { macros: scale(row, c.quantity / 100), row } : null;
  }
  const row = findFood(rows, c.foodKey, c.unit);
  return row ? { macros: scale(row, c.quantity), row } : null;
}

/** Rows to store from a web item that covered one component. */
export function rowsFromWebItem(
  c: FoodComponent,
  item: MealItemLine,
  detail: Record<string, unknown>,
): FoodRow[] {
  const kcal = item.calories;
  if (kcal === undefined || !(kcal >= 0) || !(c.quantity > 0)) return [];
  const eaten: Macros = {
    calories: kcal,
    protein_g: item.protein_g ?? 0,
    carbs_g: item.carbs_g ?? 0,
    fat_g: item.fat_g ?? 0,
  };
  const base = { food_key: c.foodKey, display_name: c.name, source: "web_research", source_detail: detail };
  const grams = item.grams !== undefined && item.grams > 0 ? item.grams : null;

  if (c.unit === "per_100g" || c.unit === "per_100ml") {
    return [{ ...base, unit: c.unit, grams_per_unit: null, ...scale(eaten, 100 / c.quantity) }];
  }
  const rows: FoodRow[] = [
    { ...base, unit: c.unit, grams_per_unit: grams ? r1(grams / c.quantity) : null, ...scale(eaten, 1 / c.quantity) },
  ];
  if (grams) rows.push({ ...base, unit: "per_100g", grams_per_unit: null, ...scale(eaten, 100 / grams) });
  return rows;
}

export type WebEstimateFn = (query: string, components?: WebComponent[]) => Promise<MealNutritionEstimate | null>;

export type FoodDbDeps = {
  lookup?: typeof lookupFoods;
  save?: typeof saveFoods;
  markUsed?: typeof markFoodsUsed;
};

/**
 * Returns an estimate when every component is answered (from the table, the web, or both);
 * null to let the caller run the whole-meal fallbacks.
 */
export async function estimateWithFoodDb(
  text: string,
  web: WebEstimateFn | null,
  deps: FoodDbDeps = {},
): Promise<MealNutritionEstimate | null> {
  const comps = parseMealComponents(text);
  if (comps.length === 0 || comps.length > 12) return null;

  const rows = await (deps.lookup ?? lookupFoods)(comps.map((c) => c.foodKey));
  const known = comps.map((c) => macrosFromRows(c, rows));
  const missing = comps.map((_, i) => i).filter((i) => known[i] === null);
  const usedRows = known.flatMap((k) => (k ? [k.row] : []));

  const items: MealItemLine[] = comps.map((c, i) =>
    known[i] ? { name: c.phrase, ...known[i]!.macros, portion_note: `food database · ${amountLabel(c)}` } : { name: c.phrase },
  );
  let webAssumption: string | null = null;
  let providerRaw: Record<string, unknown> = { food_db_hits: comps.length - missing.length };

  if (missing.length) {
    if (!web) return null;
    const asked: WebComponent[] = missing.map((i, n) => ({
      index: n + 1,
      name: comps[i]!.name,
      amount: comps[i]!.assumedQuantity ? "no amount given (assume one typical serving)" : amountLabel(comps[i]!),
    }));
    const res = await web(text, asked);
    if (!res || res.calories === null) return null;
    const byIndex = new Map<number, MealItemLine>();
    for (const it of res.items) if (it.component_index !== undefined) byIndex.set(it.component_index, it);
    // Model forgot the indexes but returned one item per component: take them in order.
    if (byIndex.size < asked.length && res.items.length === asked.length) {
      res.items.forEach((it, n) => byIndex.set(n + 1, it));
    }
    if (asked.some((a) => byIndex.get(a.index)?.calories === undefined)) {
      logger.info({ asked: asked.length, got: res.items.length }, "food db: web items didn't line up with components");
      // Still a whole-meal answer when nothing came from the table; just nothing to store.
      return missing.length === comps.length ? res : null;
    }

    const toSave: FoodRow[] = [];
    const detail = { meal_text: text.slice(0, 300), serving_assumption: res.serving_assumption ?? null, citations: res.providerRaw?.citations ?? [] };
    missing.forEach((ci, n) => {
      const it = byIndex.get(n + 1)!;
      items[ci] = {
        name: comps[ci]!.phrase,
        calories: it.calories,
        protein_g: it.protein_g ?? 0,
        carbs_g: it.carbs_g ?? 0,
        fat_g: it.fat_g ?? 0,
        portion_note: it.portion_note,
        grams: it.grams,
      };
      toSave.push(...rowsFromWebItem(comps[ci]!, it, detail));
    });
    void (deps.save ?? saveFoods)(toSave).catch(() => undefined);
    webAssumption = res.serving_assumption ?? null;
    providerRaw = { ...providerRaw, ...(res.providerRaw ?? {}), food_db_saved: toSave.length };
  }
  if (usedRows.length) void (deps.markUsed ?? markFoodsUsed)(usedRows).catch(() => undefined);

  const sum = (k: keyof Macros): number => r1(items.reduce((s, it) => s + (it[k] ?? 0), 0));
  const fromDb = comps.filter((_, i) => known[i]).map((c) => `${c.name} (${amountLabel(c)})`);
  const assumption = [
    fromDb.length ? `From your food database: ${fromDb.join(", ")}.` : null,
    webAssumption,
  ].filter(Boolean).join(" ");

  return {
    calories: sum("calories"),
    protein_g: sum("protein_g"),
    carbs_g: sum("carbs_g"),
    fat_g: sum("fat_g"),
    items,
    source: missing.length ? "web_research" : "food_db",
    serving_assumption: assumption || null,
    providerRaw,
  };
}
