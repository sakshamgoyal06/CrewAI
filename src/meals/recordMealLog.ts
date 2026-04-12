import { supabase } from "../tools/clients.js";
import type { MealNutritionEstimate } from "./types.js";

export type RecordMealLogInput = {
  userProfileId: string;
  rawText: string;
  estimate: MealNutritionEstimate;
  sourceChannel?: "telegram" | "api" | "system";
};

export type RecordMealLogResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

export async function recordMealLog(input: RecordMealLogInput): Promise<RecordMealLogResult> {
  const { data, error } = await supabase
    .from("meal_logs")
    .insert({
      user_profile_id: input.userProfileId,
      raw_text: input.rawText,
      calories: input.estimate.calories,
      protein_g: input.estimate.protein_g,
      carbs_g: input.estimate.carbs_g,
      fat_g: input.estimate.fat_g,
      estimate_source: input.estimate.source,
      items: input.estimate.items,
      provider_raw: input.estimate.providerRaw,
      source_channel: input.sourceChannel ?? "telegram",
    })
    .select("id")
    .single();

  if (error) {
    return { ok: false, error: error.message };
  }
  if (!data?.id) {
    return { ok: false, error: "no id returned" };
  }
  return { ok: true, id: data.id };
}
