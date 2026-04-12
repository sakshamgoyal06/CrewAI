import type { MealNutritionEstimate } from "../types.js";

type CnItem = {
  name: string;
  calories: number;
  protein_g: number;
  carbohydrates_total_g: number;
  fat_total_g: number;
};

type CnResponse = { items: CnItem[] };

/**
 * CalorieNinjas — natural-language query (good free-text; sign up for API key).
 * https://calorieninjas.com/api
 */
export async function estimateViaCalorieNinjas(
  query: string,
): Promise<MealNutritionEstimate | null> {
  const apiKey = process.env.CALORIENINJAS_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }

  const q = query.trim();
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

  let calories = 0;
  let protein = 0;
  let carbs = 0;
  let fat = 0;
  const items = data.items.map((it) => {
    calories += it.calories;
    protein += it.protein_g;
    carbs += it.carbohydrates_total_g;
    fat += it.fat_total_g;
    return {
      name: it.name,
      calories: it.calories,
      protein_g: it.protein_g,
      carbs_g: it.carbohydrates_total_g,
      fat_g: it.fat_total_g,
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
