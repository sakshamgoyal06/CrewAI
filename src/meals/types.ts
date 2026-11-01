export type MealItemLine = {
  name: string;
  calories?: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
  /** How this line’s numbers relate to what the user ate (e.g. inferred serving). */
  portion_note?: string;
  /** 1-based component number when the estimator was given a numbered component list. */
  component_index?: number;
  /** Estimated weight of the amount eaten, in grams. */
  grams?: number;
};

export type MealNutritionEstimate = {
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  items: MealItemLine[];
  source:
    | "web_research"
    | "healthifyme_proxy"
    | "calorieninjas"
    | "usda_fdc"
    | "llm_estimate"
    | "food_db"
    | "unavailable";
  providerRaw: Record<string, unknown> | null;
  /**
   * Human-readable: what serving / source the numbers assume (required for web path when inferring).
   */
  serving_assumption?: string | null;
};
