import { logger } from "../../logger.js";
import type { MealNutritionEstimate } from "../types.js";
import { normalizeQueryForCalorieNinjas } from "../mealPortionParse.js";
import { narrowCalorieNinjaLinesToBestMatch } from "./calorieNinjaPick.js";
import { scaleCalorieNinjaLinesByUserGrams } from "./calorieNinjasScale.js";

type CnItem = {
  name: string;
  calories: number;
  protein_g: number;
  carbohydrates_total_g: number;
  fat_total_g: number;
  serving_size_g?: number;
};

type CnResponse = { items: CnItem[] };

/**
 * CalorieNinjas — natural-language query (good free-text; sign up for API key).
 * https://calorieninjas.com/api
 *
 * Notes:
 * - Default serving is 100g if quantity isn't parsed; macros are for `serving_size_g` per item.
 * - We normalize `gm`→`g` and scale each line when user grams match phrase count.
 */
export async function estimateViaCalorieNinjas(
  query: string,
): Promise<MealNutritionEstimate | null> {
  const apiKey = process.env.CALORIENINJAS_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }

  const q = normalizeQueryForCalorieNinjas(query.trim());
  if (q.length > 1500) {
    return null;
  }

  const url = new URL("https://api.calorieninjas.com/v1/nutrition");
  url.searchParams.set("query", q);

  const res = await fetch(url.toString(), {
    headers: { "X-Api-Key": apiKey },
  });

  if (!res.ok) {
    return null;
  }

  const data = (await res.json()) as CnResponse;
  if (!data.items?.length) {
    return null;
  }

  const withServing = data.items.map((it) => {
    const raw = it as CnItem & { food_name?: string };
    const name =
      typeof raw.name === "string" && raw.name.trim()
        ? raw.name.trim()
        : typeof raw.food_name === "string" && raw.food_name.trim()
          ? raw.food_name.trim()
          : "";
    const serving_size_g =
      typeof raw.serving_size_g === "number" && raw.serving_size_g > 0
        ? raw.serving_size_g
        : null;
    return {
      name,
      calories: it.calories,
      protein_g: it.protein_g,
      carbs_g: it.carbohydrates_total_g,
      fat_g: it.fat_total_g,
      serving_size_g,
    };
  });

  const narrowed = narrowCalorieNinjaLinesToBestMatch(q, withServing);
  if (narrowed.length < withServing.length) {
    logger.debug(
      {
        query: q,
        raw_item_count: withServing.length,
        picked_name: narrowed[0]?.name,
      },
      "calorieninjas kept single best-matching line",
    );
  }

  const scaled = scaleCalorieNinjaLinesByUserGrams(q, narrowed);

  logger.debug(
    {
      query: q,
      raw_item_count: data.items.length,
      after_narrow_count: narrowed.length,
      scaled_item_count: scaled.length,
      calories_after_scale: scaled.reduce((s, it) => s + it.calories, 0),
    },
    "calorieninjas estimate",
  );

  let calories = 0;
  let protein = 0;
  let carbs = 0;
  let fat = 0;
  const items = scaled.map((it) => {
    calories += it.calories;
    protein += it.protein_g;
    carbs += it.carbs_g;
    fat += it.fat_g;
    return {
      name: it.name,
      calories: it.calories,
      protein_g: it.protein_g,
      carbs_g: it.carbs_g,
      fat_g: it.fat_g,
    };
  });

  return {
    calories: round1(calories),
    protein_g: round1(protein),
    carbs_g: round1(carbs),
    fat_g: round1(fat),
    items,
    source: "calorieninjas",
    providerRaw: data as unknown as Record<string, unknown>,
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
