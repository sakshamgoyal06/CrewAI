import { supabase } from "../tools/clients.js";

export type DayNutritionTotals = {
  date: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

export type DailyTargets = {
  daily_calorie_target: number | null;
  daily_protein_g_target: number | null;
  daily_carbs_g_target: number | null;
  daily_fat_g_target: number | null;
};

function num(v: unknown): number {
  if (v === null || v === undefined) {
    return 0;
  }
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Sums `meal_logs` for a user on `date` (YYYY-MM-DD, same convention as inserts). */
export async function sumMealLogsForDay(
  userProfileId: string,
  date: string,
): Promise<DayNutritionTotals> {
  const { data, error } = await supabase
    .from("meal_logs")
    .select("calories, protein_g, carbs_g, fat_g")
    .eq("user_profile_id", userProfileId)
    .eq("date", date);

  if (error || !data?.length) {
    return { date, calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
  }

  let calories = 0;
  let protein_g = 0;
  let carbs_g = 0;
  let fat_g = 0;
  for (const row of data) {
    calories += num(row.calories);
    protein_g += num(row.protein_g);
    carbs_g += num(row.carbs_g);
    fat_g += num(row.fat_g);
  }

  return {
    date,
    calories: Math.round(calories),
    protein_g: Math.round(protein_g * 10) / 10,
    carbs_g: Math.round(carbs_g * 10) / 10,
    fat_g: Math.round(fat_g * 10) / 10,
  };
}

export async function loadDailyTargets(userProfileId: string): Promise<DailyTargets | null> {
  const { data, error } = await supabase
    .from("user_health_profile")
    .select(
      "daily_calorie_target, daily_protein_g_target, daily_carbs_g_target, daily_fat_g_target",
    )
    .eq("user_profile_id", userProfileId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return {
    daily_calorie_target:
      data.daily_calorie_target !== null && data.daily_calorie_target !== undefined
        ? Number(data.daily_calorie_target)
        : null,
    daily_protein_g_target:
      data.daily_protein_g_target !== null && data.daily_protein_g_target !== undefined
        ? num(data.daily_protein_g_target)
        : null,
    daily_carbs_g_target:
      data.daily_carbs_g_target !== null && data.daily_carbs_g_target !== undefined
        ? num(data.daily_carbs_g_target)
        : null,
    daily_fat_g_target:
      data.daily_fat_g_target !== null && data.daily_fat_g_target !== undefined
        ? num(data.daily_fat_g_target)
        : null,
  };
}
