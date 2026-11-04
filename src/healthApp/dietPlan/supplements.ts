/**
 * Supplements taken every day (whey, creatine, a multivitamin, a gainer). They are asked for in
 * the plan setup because they carry real calories and protein: a daily scoop of whey is 24 g of
 * the protein target, so the meals around it are planned smaller. Pure; reads the food catalog.
 */
import { catalog, lookupFood, servingLabel, type CatalogEntry } from "../../meals/catalog/index.js";
import { foodKeyFor } from "../../meals/foodParse.js";
import type { MealBudget, PlanSlot } from "./targets.js";

export type SupplementPref = { name: string; servings: number; slot?: PlanSlot | null };

export type SupplementLine = {
  /** Catalog name ("Whey protein"). */
  name: string;
  servings: number;
  slot: PlanSlot | null;
  /** "1 scoop (30 g)". */
  text: string;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
};

const r1 = (n: number) => Math.round(n * 10) / 10;

/** The catalog's supplements (what the setup screen offers), most common first. */
export function supplementChoices(): Array<{ name: string; label: string; unit: string; kcal: number; proteinG: number }> {
  return catalog()
    .entries.filter((e) => e.kind === "food" && e.category === "supplement")
    .sort((a, b) => b.popularity - a.popularity || a.name.localeCompare(b.name))
    .map((e) => {
      const s = e.servings.find((x) => x.default) ?? e.servings[0]!;
      const f = s.grams / 100;
      return { name: e.name, label: servingLabel(s), unit: e.name, kcal: Math.round(e.per100.kcal * f), proteinG: r1(e.per100.protein * f) };
    });
}

function entryOf(name: string): CatalogEntry | undefined {
  const e = lookupFood(foodKeyFor(name));
  return e && e.category === "supplement" ? e : undefined;
}

/** Each saved supplement as a day line; names the catalog doesn't know are dropped. */
export function supplementLines(list: SupplementPref[]): SupplementLine[] {
  const merged = new Map<string, SupplementLine>();
  for (const p of list) {
    const e = entryOf(p.name);
    if (!e) continue;
    const s = e.servings.find((x) => x.default) ?? e.servings[0]!;
    const key = `${e.key}|${p.slot ?? ""}`;
    const prev = merged.get(key);
    const servings = (prev?.servings ?? 0) + p.servings;
    merged.set(key, {
      name: e.name,
      servings,
      slot: p.slot ?? null,
      text: `${servings === 1 ? "1" : servings} × ${servingLabel(s).replace(/^1\s+/, "")}`,
      kcal: Math.round(e.per100.kcal * ((s.grams * servings) / 100)),
      proteinG: r1(e.per100.protein * ((s.grams * servings) / 100)),
      carbsG: r1(e.per100.carbs * ((s.grams * servings) / 100)),
      fatG: r1(e.per100.fat * ((s.grams * servings) / 100)),
    });
  }
  return [...merged.values()];
}

export function supplementTotals(lines: SupplementLine[]) {
  return lines.reduce(
    (a, l) => ({ kcal: a.kcal + l.kcal, proteinG: a.proteinG + l.proteinG, carbsG: a.carbsG + l.carbsG, fatG: a.fatG + l.fatG }),
    { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  );
}

/** Never let supplements squeeze a meal below this share of its budget. */
const MIN_MEAL_SHARE = 0.4;

/**
 * Takes the supplements' calories and macros out of the meal budgets. A supplement with a slot
 * (whey at breakfast) comes out of that meal; the rest come out of all meals in proportion.
 */
export function budgetsAfterSupplements(budgets: MealBudget[], lines: SupplementLine[]): MealBudget[] {
  if (!lines.length || !budgets.length) return budgets;
  const out = budgets.map((b) => ({ ...b }));
  const take = (b: MealBudget, kcal: number, p: number, c: number, f: number, floor: MealBudget) => {
    b.calories = Math.max(Math.round(floor.calories * MIN_MEAL_SHARE), Math.round(b.calories - kcal));
    b.proteinG = Math.max(Math.round(floor.proteinG * MIN_MEAL_SHARE), Math.round(b.proteinG - p));
    b.carbsG = Math.max(0, Math.round(b.carbsG - c));
    b.fatG = Math.max(0, Math.round(b.fatG - f));
  };
  const total = budgets.reduce((a, b) => a + b.calories, 0) || 1;
  for (const l of lines) {
    const own = l.slot ? out.findIndex((b) => b.slot === l.slot) : -1;
    if (own >= 0) {
      take(out[own]!, l.kcal, l.proteinG, l.carbsG, l.fatG, budgets[own]!);
      continue;
    }
    out.forEach((b, i) => {
      const f = budgets[i]!.calories / total;
      take(b, l.kcal * f, l.proteinG * f, l.carbsG * f, l.fatG * f, budgets[i]!);
    });
  }
  return out;
}
