import type { MealNutritionEstimate } from "../types.js";

/**
 * USDA FoodData Central — search + first food detail (optional `USDA_FDC_API_KEY`).
 * https://fdc.nal.usda.gov/api-guide
 */
export async function estimateViaUsdaFdc(query: string): Promise<MealNutritionEstimate | null> {
  const apiKey = process.env.USDA_FDC_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }

  const searchUrl = new URL("https://api.nal.usda.gov/fdc/v1/foods/search");
  searchUrl.searchParams.set("api_key", apiKey);
  searchUrl.searchParams.set("query", query.trim().slice(0, 200));
  searchUrl.searchParams.set("pageSize", "1");

  const searchRes = await fetch(searchUrl.toString());
  if (!searchRes.ok) {
    return null;
  }

  const searchJson = (await searchRes.json()) as {
    foods?: { fdcId: number; description?: string }[];
  };
  const fdcId = searchJson.foods?.[0]?.fdcId;
  if (fdcId === undefined) {
    return null;
  }

  const foodUrl = `https://api.nal.usda.gov/fdc/v1/food/${fdcId}?api_key=${encodeURIComponent(apiKey)}`;
  const foodRes = await fetch(foodUrl);
  if (!foodRes.ok) {
    return null;
  }

  const food = (await foodRes.json()) as {
    description?: string;
    foodNutrients?: { nutrientId?: number; amount?: number }[];
  };

  const byId = new Map<number, number>();
  for (const n of food.foodNutrients ?? []) {
    if (n.nutrientId !== undefined && typeof n.amount === "number") {
      byId.set(n.nutrientId, n.amount);
    }
  }

  // FDC nutrient ids (legacy / common)
  const calories = byId.get(1008) ?? null;
  const protein = byId.get(1003) ?? null;
  const carbs = byId.get(1005) ?? null;
  const fat = byId.get(1004) ?? null;

  const name = food.description ?? `FDC ${fdcId}`;

  return {
    calories,
    protein_g: protein,
    carbs_g: carbs,
    fat_g: fat,
    items: [{ name, calories: calories ?? undefined }],
    source: "usda_fdc",
    providerRaw: { fdcId, food } as unknown as Record<string, unknown>,
  };
}
