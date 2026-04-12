export type MealItemLine = {
  name: string;
  calories?: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
};

export type MealNutritionEstimate = {
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  items: MealItemLine[];
  source: "healthifyme_proxy" | "calorieninjas" | "usda_fdc" | "llm_estimate" | "unavailable";
  providerRaw: Record<string, unknown> | null;
};
