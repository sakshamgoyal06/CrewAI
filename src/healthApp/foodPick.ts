/**
 * "Log my own" starts from the food database: search by name, pick a household serving, set the
 * amount. Only what the catalog doesn't have goes on to the chat estimate.
 */
import { searchCatalog } from "../meals/catalog/search.js";
import { servingId, servingLabel } from "../meals/catalog/index.js";

export type FoodPickServing = { id: string; label: string; grams: number; default: boolean; kcal: number; proteinG: number; carbsG: number; fatG: number };
export type FoodPick = { key: string; name: string; diet: string; servings: FoodPickServing[] };

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Matches for a search box, or the most popular foods for an empty one. Cooking ingredients are left out. */
export function searchFoods(query: string, limit = 20): FoodPick[] {
  return searchCatalog(query, { limit, eatenOnly: true }).map(({ entry: e }) => ({
    key: e.key,
    name: e.name,
    diet: e.diet,
    servings: e.servings.map((s) => {
      const f = s.grams / 100;
      return {
        id: servingId(e.key, s),
        label: servingLabel(s),
        grams: s.grams,
        default: !!s.default,
        kcal: Math.round(e.per100.kcal * f),
        proteinG: r1(e.per100.protein * f),
        carbsG: r1(e.per100.carbs * f),
        fatG: r1(e.per100.fat * f),
      };
    }),
  }));
}
