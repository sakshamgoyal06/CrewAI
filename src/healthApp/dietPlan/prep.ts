/**
 * How long a planned meal takes, said honestly: hands-on time, total time, and what has to be
 * ready first ("uses cooked rajma"). The catalog stores one rough number per dish (0, 10, 20,
 * or 30 meaning 30+); this turns it into a method with a starting state. Pure.
 *
 * A meal's dishes cook in parallel (rice cooks while the curry simmers), so the meal's total is
 * its slowest dish plus a few minutes, while hands-on time adds up.
 */
import { DISHES } from "../../meals/catalog/data/dishes.js";
import type { CatalogEntry } from "../../meals/catalog/index.js";
import { foodKeyFor } from "../../meals/foodParse.js";

export type DishPrep = { active: number; total: number; needs: string[]; note?: string };
export type MealPrep = { activeMinutes: number; totalMinutes: number; needs: string[]; notes: string[] };

const RECIPES = new Map(DISHES.map((d) => [foodKeyFor(d.name), d.recipe.map(([n]) => foodKeyFor(n))]));

/** Ingredients that are themselves cooked ahead; a quick dish using them needs them ready. */
const COOKED_AHEAD: Record<string, string> = {
  "kidney beans boiled": "cooked rajma (soaked overnight and pressure-cooked, or tinned)",
  "chickpeas boiled": "cooked chickpeas (soaked overnight and pressure-cooked, or tinned)",
  "lentils boiled": "cooked lentils",
  "white rice cooked": "cooked rice",
  "brown rice cooked": "cooked brown rice",
  "chicken breast cooked": "cooked chicken",
  "mutton cooked": "cooked mutton",
  "egg boiled": "boiled eggs",
};

const SLOW_MEAT = /\b(mutton|lamb|goat|gosht|mangsho|yakhni|rogan josh|nihari|paya|beef|pork)\b/;
const DRY_PULSE = /\b(rajma|chole|chana masala|lobia|kala chana|dal makhani)\b/;

export function dishPrep(e: CatalogEntry): DishPrep {
  if (/^(white|brown) rice cooked$|^jeera rice$|^(millet|quinoa) cooked$/.test(e.key)) return { active: 5, total: 20, needs: [] };
  const p = e.prepMinutes ?? 0;
  if (e.ordered || p === 0) return { active: 0, total: 0, needs: [] };
  const recipe = RECIPES.get(e.key) ?? [];
  // A quick dish (10 minutes) built on cooked pulses or rice is only quick because they're ready.
  const needs = p <= 10 ? recipe.map((k) => COOKED_AHEAD[k]).filter((x): x is string => !!x) : [];
  if (e.category === "bread" && p <= 20) return { active: 15, total: 20, needs: [] };
  if (/\b(seekh|shami|kebab|kabab|tikka)\b/.test(e.key) && e.diet === "nonveg") {
    return { active: 30, total: 50, needs: [], note: "made fresh (marinate, shape, grill); reheating ready-made kebabs takes about 5 minutes" };
  }
  if (p >= 30 && SLOW_MEAT.test(e.key)) return { active: 25, total: 75, needs, note: "mutton needs about 45 minutes in a pressure cooker, longer in a pot" };
  if (p >= 30 && DRY_PULSE.test(e.key)) return { active: 20, total: 50, needs: [...needs, "pulses soaked overnight"], note: "from dry beans, pressure-cooked; about 20 minutes with tinned" };
  if (p >= 30 && e.diet === "nonveg") return { active: 20, total: 45, needs };
  if (p >= 30) return { active: 20, total: 35, needs };
  if (p === 20) return { active: 15, total: 20, needs };
  return { active: 10, total: 10, needs };
}

export function mealPrep(entries: CatalogEntry[]): MealPrep {
  const parts = entries.map(dishPrep);
  const cooked = parts.filter((x) => x.total > 0);
  const active = cooked.reduce((a, x) => a + x.active, 0);
  const slowest = Math.max(0, ...cooked.map((x) => x.total));
  // Parallel cooking: the slowest dish sets the pace, but you can't be at two stoves at once.
  const total = cooked.length ? Math.max(slowest, active) + (cooked.length > 1 ? 5 : 0) : 0;
  return {
    activeMinutes: active,
    totalMinutes: total,
    needs: [...new Set(parts.flatMap((x) => x.needs))],
    notes: [...new Set(parts.map((x) => x.note).filter((x): x is string => !!x))],
  };
}

/** "About 35 min, 20 hands-on · uses cooked rajma". */
export function prepText(p: MealPrep): string {
  if (!p.totalMinutes) return p.needs.length ? `No cooking · uses ${p.needs.join(", ")}` : "No cooking";
  const base = p.activeMinutes && p.activeMinutes < p.totalMinutes ? `About ${p.totalMinutes} min, ${p.activeMinutes} hands-on` : `About ${p.totalMinutes} min`;
  return p.needs.length ? `${base} · uses ${p.needs.join(", ")}` : base;
}
