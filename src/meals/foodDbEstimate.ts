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
import { amountLabel, foodKeyFor, parseFoodPhrase, parseMealComponents, type FoodComponent, type FoodUnit } from "./foodParse.js";
import {
  confirmFoods,
  confirmRecipes,
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
import type { Breakdown, BreakdownIngredient, BreakdownRequestItem } from "./providers/webBreakdown.js";
import { logger } from "../logger.js";
import { CONFIRMED_SOURCE, PENDING_SOURCE, splitPending, type FoodContributor } from "./foodTrust.js";
import { catalog as defaultCatalog, defaultServing, resolveCatalogItem, type Catalog, type CatalogEntry, type CatalogMatch } from "./catalog/index.js";
import { popularityScore, searchCatalog } from "./catalog/search.js";
import { recordFoodGaps } from "./foodGaps.js";
import type { MealItemLine, MealNutritionEstimate } from "./types.js";

/** An ingredient amount: `quantity` in the row's unit (grams/ml for the per-100 units). */
export type IngredientLine = { row: FoodRow; quantity: number; label?: string };

/** Rows made from the shipped catalog (not stored in Supabase, so never marked used). */
export const CATALOG_SOURCE = "magnus_catalog";

/** A catalog match as an ingredient line: grams of the food on its per-100 basis. */
export function lineFromCatalog(m: CatalogMatch): IngredientLine {
  const p = m.entry.per100;
  return {
    row: {
      food_key: m.entry.key,
      unit: m.entry.basis === "100ml" ? "per_100ml" : "per_100g",
      display_name: m.entry.name,
      grams_per_unit: null,
      calories: p.kcal,
      protein_g: p.protein,
      carbs_g: p.carbs,
      fat_g: p.fat,
      source: CATALOG_SOURCE,
    },
    quantity: m.grams,
    label: `${m.entry.name} · ${m.amount}`,
  };
}

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
  if (l.label) return l.label;
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
  source: string = CONFIRMED_SOURCE,
): { lines: IngredientLine[]; newFoods: FoodRow[]; recipe: RecipeRow | null } {
  const lines: IngredientLine[] = [];
  const newFoods: FoodRow[] = [];
  const contributor = typeof detail.contributor === "string" ? detail.contributor : null;
  for (const ing of ingredients) {
    const key = foodKeyFor(ing.food);
    if (!key) continue;
    // Keep numbers stable: an ingredient already in the table wins over a fresh web value.
    let row = rowFor(tables, key, ing.unit);
    if (!row) {
      // One implausible new value sinks the item: a dish missing its oil is worse than no estimate.
      if (!plausibleIngredient(ing)) return { lines: [], newFoods: [], recipe: null };
      row = {
        food_key: key,
        unit: ing.unit,
        display_name: ing.food,
        grams_per_unit: ing.grams_per_unit,
        ...ing.per_unit,
        source,
        source_detail: detail,
        contributor,
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
          source,
          source_detail: detail,
          contributor,
        };
  return { lines, newFoods, recipe };
}

const ALCOHOL = /\b(beer|wine|whisk(e)?y|vodka|rum|gin|brandy|tequila|liqueur|cocktail|sake|cider|alcohol|toddy|feni)\b/i;

/**
 * Sanity check on a web value before anyone eats by it or it is saved (OWASP LLM04/LLM09): energy
 * within physical limits, macros that fit in the weight, and calories that match the macros
 * (4/4/9 kcal per gram, alcohol aside).
 */
export function plausibleIngredient(ing: BreakdownIngredient): boolean {
  const { calories: k, protein_g: p, carbs_g: c, fat_g: f } = ing.per_unit;
  const mass = p + c + f;
  if (isPer100(ing.unit)) {
    if (k > 900 || mass > 105 || ing.quantity > 3000) return false;
  } else {
    if (k > 2500 || ing.quantity > 50) return false;
    const g = ing.grams_per_unit;
    if (g !== null && (g > 2000 || k > g * 9.5 + 5 || mass > g * 1.05 + 1)) return false;
  }
  const atwater = 4 * p + 4 * c + 9 * f;
  if (ALCOHOL.test(ing.food)) return atwater <= k * 1.3 + 15;
  return Math.abs(k - atwater) <= Math.max(25, 0.3 * Math.max(k, atwater));
}

const close = (x: number, y: number, rel: number, abs: number): boolean => Math.abs(x - y) <= Math.max(abs, rel * Math.max(x, y));

/** Two lookups of the same food in the same unit give about the same numbers. */
export function foodsAgree(a: FoodRow, b: FoodRow): boolean {
  return (
    close(a.calories, b.calories, 0.15, 15) &&
    close(a.protein_g, b.protein_g, 0.25, 3) &&
    close(a.carbs_g, b.carbs_g, 0.25, 4) &&
    close(a.fat_g, b.fat_g, 0.25, 3) &&
    (a.grams_per_unit === null || b.grams_per_unit === null || close(a.grams_per_unit, b.grams_per_unit, 0.25, 10))
  );
}

/** Same ingredients, in about the same amounts. */
export function recipesAgree(a: RecipeRow, b: RecipeRow): boolean {
  if (a.components.length !== b.components.length) return false;
  const bByKey = new Map(b.components.map((c) => [recipeKey(c.food_key, c.unit), c.quantity]));
  return a.components.every((c) => {
    const q = bByKey.get(recipeKey(c.food_key, c.unit));
    return q !== undefined && close(c.quantity, q, 0.3, 5);
  });
}

/**
 * "fish curry rice", "dal rice", "chicken curry roti": two catalog foods typed together with no
 * "with" or comma. Only when the whole name isn't a catalog food and both halves are; the amount
 * goes to the first half and the second is one usual serving.
 */
function splitJoined(c: FoodComponent, cat: Catalog): FoodComponent[] | null {
  if (c.unit === "per_100g" || c.unit === "per_100ml" || resolveCatalogItem(c, cat)) return null;
  const words = c.name.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 5) return null;
  for (let i = words.length - 1; i >= 1; i--) {
    const a = words.slice(0, i).join(" ");
    const b = words.slice(i).join(" ");
    const first: FoodComponent = { ...c, phrase: a, name: a, foodKey: foodKeyFor(a) };
    const second: FoodComponent = { phrase: b, name: b, foodKey: foodKeyFor(b), quantity: 1, unit: "serving", assumedQuantity: true };
    const fa = resolveCatalogItem(first, cat);
    const fb = resolveCatalogItem(second, cat);
    if (!fa || !fb) continue;
    // "whey protein powder" = "whey" + "protein powder": two names for one food, so one item
    // (the 6 Nov label photo logged two scoops).
    if (fa.entry.key === fb.entry.key) return [{ ...c, foodKey: fa.entry.key }];
    return [first, second];
  }
  return null;
}

/** A splash of milk in a cup of black coffee or tea, not a glass of it. */
const MILK_SPLASH_ML = 30;

/**
 * An addition named after a drink or dish ("with milk", "and sugar") with no amount of its own:
 * dropped when the base already has it (chai has milk and sugar), a splash when it's milk in a
 * plain cup drink (black coffee, black tea), kept when it's a spoonful (sugar, honey). null = a
 * food of its own ("biscuit"), which the caller keeps as typed and which ends the additions.
 */
function asAddition(p: FoodComponent, base: CatalogEntry, cat: Catalog): { keep: FoodComponent | null } | null {
  if (!p.assumedQuantity) return null;
  const e = resolveCatalogItem(p, cat)?.entry;
  if (!e) return null;
  if (base.contains.includes(e.key)) return { keep: null };
  const cupDrink = base.category === "drink" && base.basis === "100ml" && defaultServing(base).unit === "cup";
  if (cupDrink && e.category === "dairy" && e.basis === "100ml") {
    return { keep: { ...p, quantity: MILK_SPLASH_ML, unit: "per_100ml", assumedQuantity: false } };
  }
  // Sugar, honey, ghee: a spoonful of its own, and more additions may follow it.
  const unit = defaultServing(e).unit;
  if (unit === "tsp" || unit === "tbsp") return { keep: p };
  return null;
}

/**
 * "aloo paratha with curd" → aloo paratha + curd, but only when the whole phrase isn't a catalog
 * food and every part is ("coffee with milk" stays one item if it's known as a whole). The list
 * is split on "and" before this runs, so "tea with milk and sugar" arrives as "tea with milk" +
 * "sugar": additions right after a "with" item are read against the same drink.
 */
export function splitWithParts(comps: FoodComponent[], cat: Catalog): FoodComponent[] {
  const out: FoodComponent[] = [];
  /** The drink or dish the last "with" phrase was about, while its additions continue. */
  let base: CatalogEntry | null = null;
  for (const c of comps) {
    if (!/\swith\s/i.test(c.phrase)) {
      const add = base ? asAddition(c, base, cat) : null;
      if (add) {
        if (add.keep) out.push(add.keep);
        continue;
      }
      base = null;
      out.push(...(splitJoined(c, cat) ?? [c]));
      continue;
    }
    base = null;
    if (resolveCatalogItem(c, cat)) {
      out.push(c);
      continue;
    }
    const [first, ...rest] = c.phrase.split(/\s+with\s+/i);
    const parts = [first!, ...rest].map(parseFoodPhrase);
    if (parts.some((p) => !p) || parts.some((p) => !resolveCatalogItem(p!, cat))) {
      out.push(c);
      continue;
    }
    // "tea with milk", "chai with sugar": the drink already has them. Only an amount of its own
    // ("coffee with 1 glass milk") makes it a second item; otherwise the 6 Nov tea card added a
    // whole glass of milk the person never had.
    base = resolveCatalogItem(parts[0]!, cat)!.entry;
    out.push(parts[0]!);
    const additions: CatalogEntry = base;
    for (const p of parts.slice(1)) {
      const add = asAddition(p!, additions, cat);
      if (add?.keep) out.push(add.keep);
      if (add) continue;
      out.push(p!);
      // A food of its own ("chai with biscuit") ends the drink's additions.
      base = null;
    }
  }
  return out;
}

export type BreakdownFn = (mealText: string, items: BreakdownRequestItem[], known: string[]) => Promise<Breakdown | null>;

export type FoodDbDeps = {
  load?: typeof loadFoodTables;
  known?: typeof knownFoodNames;
  saveFoods?: typeof saveFoods;
  saveRecipes?: typeof saveRecipes;
  markUsed?: typeof markFoodsUsed;
  /** The shipped catalog; tests pass their own. */
  catalog?: Catalog;
  recordGaps?: typeof recordFoodGaps;
  confirmFoods?: typeof confirmFoods;
  confirmRecipes?: typeof confirmRecipes;
  /** Who is logging; decides which pending rows they see and how their lookups are saved. */
  contributor?: FoodContributor;
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
  const cat = deps.catalog ?? defaultCatalog();
  return estimateFromComponents(text, splitWithParts(parseMealComponents(text), cat), breakdown, deps, { search: false });
}

/**
 * One food as the coach read it from the message: the food in the person's words, the amount
 * they gave (none means one usual serving) and any detail ("no sugar", "with ghee"). The coach
 * fills these in as part of its own turn, so no text splitting and no extra model call.
 */
export type ParsedFoodItem = { food: string; quantity?: number; unit?: string; size?: "small" | "medium" | "large"; notes?: string };

const ITEM_UNITS: Record<string, FoodUnit> = {
  g: "per_100g", gram: "per_100g", grams: "per_100g", ml: "per_100ml", katori: "bowl",
  piece: "piece", bowl: "bowl", plate: "plate", cup: "cup", glass: "glass", slice: "slice", tbsp: "tbsp", tsp: "tsp",
  scoop: "scoop", ladle: "ladle", handful: "handful", serving: "serving",
};

export function componentFromItem(item: ParsedFoodItem): FoodComponent | null {
  const name = item.food.trim();
  const foodKey = foodKeyFor(name);
  if (!foodKey) return null;
  const q = Number(item.quantity);
  const has = Number.isFinite(q) && q > 0;
  const unit = ITEM_UNITS[(item.unit ?? "").toLowerCase()] ?? (has ? "piece" : "serving");
  const notes = item.notes?.trim();
  return {
    phrase: [has ? `${q}${unit === "per_100g" ? " g" : unit === "per_100ml" ? " ml" : unit === "piece" ? "" : ` ${unit}`}` : "", name, notes ? `(${notes})` : ""].filter(Boolean).join(" "),
    foodKey,
    name,
    quantity: has ? q : 1,
    unit,
    assumedQuantity: !has,
    ...(item.size ? { size: item.size } : {}),
  };
}

/** Lowest match strength (before popularity) for a search hit to stand for the food: a name word or an alias prefix. */
const SEARCH_MIN = 60;

/**
 * The catalog food a name stands for when it isn't a key or alias ("tea" → Chai through search
 * ranking). Only a strong match, so an unknown dish goes to the web instead of a lookalike.
 */
export function searchCatalogItem(c: FoodComponent, cat: Catalog): CatalogMatch | null {
  const hit = searchCatalog(c.name, { limit: 1, eatenOnly: false }, cat)[0];
  if (!hit || hit.score - 5 * popularityScore(hit.entry) < SEARCH_MIN) return null;
  return resolveCatalogItem({ ...c, foodKey: hit.entry.key }, cat);
}

/** Estimate for foods the coach already read from the message (see ParsedFoodItem). */
export async function estimateFromItems(
  text: string,
  items: ParsedFoodItem[],
  breakdown: BreakdownFn | null,
  deps: FoodDbDeps = {},
): Promise<MealNutritionEstimate | null> {
  const cat = deps.catalog ?? defaultCatalog();
  const comps = items.flatMap((i) => {
    const c = componentFromItem(i);
    if (!c) return [];
    // A detail that names a catalog food of its own ("chai" + "no sugar" → Chai without sugar).
    const notes = i.notes?.trim();
    if (notes) {
      const withNotes = { ...c, foodKey: foodKeyFor(`${c.name} ${notes}`) };
      if (resolveCatalogItem(withNotes, cat)) return [withNotes];
    }
    return [c];
  });
  return estimateFromComponents(text, comps, breakdown, deps, { search: true });
}

async function estimateFromComponents(
  text: string,
  comps: FoodComponent[],
  breakdown: BreakdownFn | null,
  deps: FoodDbDeps,
  how: { search: boolean },
): Promise<MealNutritionEstimate | null> {
  const cat = deps.catalog ?? defaultCatalog();
  if (comps.length === 0 || comps.length > 12) return null;

  // The curated catalog first (by key, then by search for parsed items); only items it can't
  // answer touch the database.
  const fromCatalog = comps.map((c) => resolveCatalogItem(c, cat) ?? (how.search ? searchCatalogItem(c, cat) : null));
  const dbKeys = comps.filter((_, i) => !fromCatalog[i]).map((c) => c.foodKey);
  const loaded: FoodTables = dbKeys.length
    ? await (deps.load ?? loadFoodTables)(dbKeys)
    : { foods: new Map(), recipes: new Map() };
  const contributor = deps.contributor;
  const { visible: tables, pendingFoods, pendingRecipes } = splitPending(loaded, contributor?.id);
  const resolved = comps.map((c, i) => {
    const m = fromCatalog[i];
    return m ? [lineFromCatalog(m)] : resolveFromTables(c, tables);
  });
  const missing = comps.map((_, i) => i).filter((i) => resolved[i] === null);
  const fromDbCount = comps.length - missing.length;

  const created = new Set<FoodRow>();
  /** Items nothing was found for (indexes into comps). */
  let unfound: number[] = [];
  let assumption: string | null = null;
  let providerRaw: Record<string, unknown> = {
    food_db_items: fromDbCount,
    catalog_items: fromCatalog.filter(Boolean).length,
  };

  if (missing.length) {
    // What the catalog should learn next (docs/FOOD_DB.md builds the most-missed foods first).
    (deps.recordGaps ?? recordFoodGaps)(missing.map((i) => comps[i]!));
    if (!breakdown) return null;
    const known = await (deps.known ?? knownFoodNames)().catch(() => [] as string[]);
    const asked = missing.map((i, n) => ({
      index: n + 1,
      phrase: comps[i]!.assumedQuantity ? `${comps[i]!.phrase} (no amount given)` : comps[i]!.phrase,
    }));
    const res = await breakdown(text, asked, known);
    // Items the lookup found nothing for stay on the card as blanks to fill in, so one unknown
    // item ("veg whopper") never wipes out the ones that were found (fries, Coke). With nothing
    // found at all, the whole-meal fallbacks still run.
    const found = missing.filter((_, n) => !!res?.items.get(n + 1)?.length);
    if (!found.length && fromDbCount === 0) return null;
    unfound = missing.filter((_, n) => !res?.items.get(n + 1)?.length);

    const trusted = contributor?.trusted === true;
    const source = trusted || !contributor ? CONFIRMED_SOURCE : PENDING_SOURCE;
    const detail = {
      meal_text: text.slice(0, 300),
      serving_assumption: res?.serving_assumption ?? null,
      citations: res?.citations ?? [],
      ...(contributor ? { contributor: contributor.id } : {}),
    };
    const newFoods: FoodRow[] = [];
    const recipes: RecipeRow[] = [];
    missing.forEach((ci, n) => {
      const got = res?.items.get(n + 1);
      if (!res || !got?.length) return;
      const out = linesFromBreakdown(comps[ci]!, got, tables, detail, source);
      resolved[ci] = out.lines;
      newFoods.push(...out.newFoods);
      out.newFoods.forEach((f) => created.add(f));
      if (out.recipe) recipes.push(out.recipe);
    });
    // An item whose new numbers failed the sanity check is a blank too.
    for (const ci of missing) if (!resolved[ci]?.length && !unfound.includes(ci)) unfound.push(ci);
    if (unfound.length === comps.length) return null;
    // Someone else's pending rows for the same foods: confirmed when this lookup agrees (or is the owner's).
    const confirmFoodRows: FoodRow[] = [];
    for (const f of newFoods) {
      const prior = pendingFoods.get(recipeKey(f.food_key, f.unit));
      if (!prior) continue;
      if (trusted) confirmFoodRows.push({ ...f, contributor: prior.contributor });
      else if (foodsAgree(prior, f)) confirmFoodRows.push({ ...prior, source_detail: f.source_detail });
      else logger.info({ food: f.food_key, unit: f.unit }, "food db: lookups disagree, row stays pending");
    }
    const confirmRecipeRows: RecipeRow[] = [];
    for (const r of recipes) {
      const prior = pendingRecipes.get(recipeKey(r.dish_key, r.unit));
      if (!prior) continue;
      if (trusted) confirmRecipeRows.push({ ...r, contributor: prior.contributor });
      else if (recipesAgree(prior, r)) confirmRecipeRows.push({ ...prior, source_detail: r.source_detail });
    }
    const by = contributor?.id ?? "unknown";
    // Foods first so a recipe never points at an ingredient that failed to save.
    void (deps.saveFoods ?? saveFoods)(newFoods)
      .then(() => (deps.saveRecipes ?? saveRecipes)(recipes, trusted || !contributor))
      .then(() => (confirmFoodRows.length ? (deps.confirmFoods ?? confirmFoods)(confirmFoodRows, by) : undefined))
      .then(() => (confirmRecipeRows.length ? (deps.confirmRecipes ?? confirmRecipes)(confirmRecipeRows, by) : undefined))
      .catch(() => undefined);
    assumption = res?.serving_assumption ?? null;
    providerRaw = {
      ...providerRaw,
      search_provider: "anthropic_web_search",
      web_search_requests: res?.web_search_requests ?? 0,
      citations: res?.citations ?? [],
      ...(unfound.length ? { not_found: unfound.map((i) => comps[i]!.phrase) } : {}),
      food_db_new_foods: newFoods.length,
      food_db_new_recipes: recipes.length,
    };
  }

  const lines = resolved.flatMap((r) => r ?? []);
  const blanks: MealItemLine[] = unfound.map((i) => ({ name: comps[i]!.phrase, calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, missing: true }));
  const stored = lines.filter((l) => !created.has(l.row) && l.row.source !== CATALOG_SOURCE);
  if (stored.length) void (deps.markUsed ?? markFoodsUsed)(stored.map((l) => l.row)).catch(() => undefined);

  const items: MealItemLine[] = [...lines.map((l) => ({ name: lineLabel(l), ...lineMacros(l) })), ...blanks];
  const sum = (k: "calories" | "protein_g" | "carbs_g" | "fat_g"): number => r1(items.reduce((s, it) => s + (it[k] ?? 0), 0));
  const note = [
    `Built from ${lines.length} ingredient${lines.length === 1 ? "" : "s"}${fromDbCount ? `; ${fromDbCount} of ${comps.length} item${comps.length === 1 ? "" : "s"} from your food database` : ""}.`,
    assumption,
    unfound.length ? `No numbers found for ${unfound.map((i) => comps[i]!.name).join(", ")}; fill ${unfound.length === 1 ? "it" : "them"} in.` : null,
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
