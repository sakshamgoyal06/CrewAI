/**
 * A weekly grocery list from the meal plan (12 Nov plan, item 9). Every shop is otherwise a set of
 * food decisions; this turns the week's planned meals into what to buy, with amounts.
 *
 * Each planned item is broken down to raw ingredients through its dish recipe (dishes can use other
 * dishes, so it recurses), scaled by the portion's grams against the recipe's cooked weight. Cooked
 * staples become what is bought (cooked rice → raw rice). Ordered food (a restaurant naan) and
 * eat-out allowances aren't groceries. Pure: no model call, no database.
 */
import { DISHES } from "../../meals/catalog/data/dishes.js";
import { catalog, type CatalogEntry } from "../../meals/catalog/index.js";
import { foodKeyFor } from "../../meals/foodParse.js";
import type { PlanItem } from "./compose.js";

const RECIPES = new Map(DISHES.map((d) => [foodKeyFor(d.name), d]));

/** Cooked staples, as bought: [name to buy, raw grams per cooked gram]. */
const AS_BOUGHT: Record<string, [string, number]> = {
  "white rice cooked": ["Rice, raw", 1 / 2.8],
  "brown rice cooked": ["Brown rice, raw", 1 / 2.6],
  "kidney beans boiled": ["Rajma, raw", 1 / 2.4],
  "chickpeas boiled": ["Kabuli chana, raw", 1 / 2.4],
  "lentils boiled": ["Masoor dal, raw", 1 / 2.4],
  "chicken breast cooked": ["Chicken breast, raw", 1.33],
  "egg boiled": ["Eggs", 1],
  "fried egg": ["Eggs", 1.09],
};

const GROUPS: Array<[string, string[]]> = [
  ["Vegetables", ["vegetable"]],
  ["Fruit", ["fruit"]],
  ["Dairy and eggs", ["dairy", "egg"]],
  ["Meat and fish", ["meat", "fish"]],
  ["Grains and flour", ["grain", "bread"]],
  ["Dal and pulses", ["pulse"]],
  ["Nuts and seeds", ["nut_seed"]],
  ["Oil, ghee and staples", ["fat_oil", "sugar_sweetener", "spice_condiment"]],
];
const OTHER = "Other";

export type GroceryItem = { name: string; amount: string; grams: number };
export type GroceryGroup = { group: string; items: GroceryItem[] };
export type GroceryList = { from: string; to: string; meals: number; groups: GroceryGroup[]; /** Items with no recipe or weight, listed by name. */ loose: string[] };

type Acc = Map<string, { name: string; grams: number; ml: boolean; category: string; eggs: boolean }>;

function add(acc: Acc, name: string, grams: number, entry: CatalogEntry | undefined): void {
  if (!(grams > 0)) return;
  const eggs = /^eggs?\b|^egg,/i.test(name) || (entry?.category === "egg" && !/white/i.test(name));
  const k = eggs ? "eggs" : foodKeyFor(name);
  const cur = acc.get(k);
  if (cur) cur.grams += grams;
  else acc.set(k, { name, grams, ml: entry?.basis === "100ml", category: entry?.category ?? "other", eggs });
}

function expand(acc: Acc, key: string, grams: number, depth = 0): void {
  const cat = catalog();
  const entry = cat.byKey.get(key);
  const bought = AS_BOUGHT[entry?.key ?? key];
  if (bought) return add(acc, bought[0], grams * bought[1], cat.byKey.get(foodKeyFor(bought[0])) ?? entry);
  const dish = RECIPES.get(entry?.key ?? key);
  if (dish && depth < 4) {
    if (entry?.ordered) return;
    for (const [n, g] of dish.recipe) expand(acc, foodKeyFor(n), (g * grams) / dish.cookedGrams, depth + 1);
    return;
  }
  if (entry?.ordered) return;
  add(acc, entry?.name ?? key, grams, entry);
}

/** "1.2 kg", "350 g", "6 eggs", "1.5 L". Pure. */
export function amountOf(grams: number, opts: { ml?: boolean; eggs?: boolean } = {}): string {
  if (opts.eggs) return `${Math.max(1, Math.round(grams / 50))} ${Math.round(grams / 50) === 1 ? "egg" : "eggs"}`;
  const unit = opts.ml ? ["ml", "L"] : ["g", "kg"];
  if (grams >= 1000) return `${(Math.round(grams / 100) / 10).toLocaleString("en-US")} ${unit[1]}`;
  const step = grams < 100 ? 10 : 50;
  return `${Math.max(step, Math.round(grams / step) * step)} ${unit[0]}`;
}

/**
 * The list for the planned meals given (eaten ones are already bought). Tiny amounts (under 15 g,
 * like a spoon of oil in total) are left out: they're in every kitchen. Pure.
 */
export function groceryList(meals: Array<{ date: string; kind?: string; status?: string; items: PlanItem[] }>): GroceryList {
  const acc: Acc = new Map();
  const loose = new Set<string>();
  const todo = meals.filter((m) => m.kind !== "eat_out" && (m.status ?? "planned") === "planned");
  for (const m of todo) {
    for (const it of m.items) {
      if (it.key && it.grams) expand(acc, it.key, it.grams);
      else loose.add(it.name);
    }
  }
  const groups = new Map<string, GroceryItem[]>();
  for (const v of acc.values()) {
    if (v.grams < 15 && !v.eggs) continue;
    const g = v.eggs ? "Dairy and eggs" : GROUPS.find(([, cats]) => cats.includes(v.category))?.[0] ?? OTHER;
    const list = groups.get(g) ?? [];
    list.push({ name: v.eggs ? "Eggs" : v.name.replace(/, raw$/i, ""), amount: amountOf(v.grams, { ml: v.ml, eggs: v.eggs }), grams: Math.round(v.grams) });
    groups.set(g, list);
  }
  const order = [...GROUPS.map(([g]) => g), OTHER];
  const dates = todo.map((m) => m.date).sort();
  return {
    from: dates[0] ?? "",
    to: dates.at(-1) ?? "",
    meals: todo.length,
    groups: order.filter((g) => groups.has(g)).map((g) => ({ group: g, items: groups.get(g)!.sort((a, b) => b.grams - a.grams) })),
    loose: [...loose].sort(),
  };
}
