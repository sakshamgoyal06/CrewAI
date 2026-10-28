/**
 * Day nutrition totals for Health EOD journal prompt injection.
 */
import { localDateKey } from "../localDate.js";
import { supabase } from "../../tools/clients.js";

function num(v: unknown): number {
  if (v === null || v === undefined) {
    return 0;
  }
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function parseFlags(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.filter((f): f is string => typeof f === "string");
  }
  return [];
}

export async function buildNutritionJournalContext(input: {
  userProfileId: string;
  timezone?: string | null;
  now?: Date;
}): Promise<string> {
  const now = input.now ?? new Date();
  const localDate = localDateKey(now, input.timezone);

  const { data, error } = await supabase
    .from("meal_daily_rollups")
    .select(
      "calories, protein_g, carbs_g, fat_g, meal_count, snack_count, slots_logged, target_calories, target_protein_g, adherence_score, flags",
    )
    .eq("user_profile_id", input.userProfileId)
    .eq("local_date", localDate)
    .maybeSingle();

  if (error || !data) {
    return "";
  }

  const calories = num(data.calories);
  const protein = num(data.protein_g);
  const meals = num(data.meal_count);
  const snacks = num(data.snack_count);
  const targetCal = data.target_calories != null ? num(data.target_calories) : null;
  const targetProtein = data.target_protein_g != null ? num(data.target_protein_g) : null;
  const flags = parseFlags(data.flags);
  const slots = Array.isArray(data.slots_logged)
    ? (data.slots_logged as string[]).filter(Boolean).join(", ")
    : "";

  if (meals + snacks === 0 && calories === 0) {
    return `\n\nNutrition today (${localDate}): no meals logged yet.`;
  }

  const parts = [
    `\n\nNutrition today (${localDate}) — logged meals only (not the meal plan menu):`,
    `${Math.round(calories)} kcal`,
    `${Math.round(protein * 10) / 10}g protein`,
  ];

  if (targetCal != null || targetProtein != null) {
    const targetParts: string[] = [];
    if (targetCal != null) {
      targetParts.push(`${Math.round(targetCal)} kcal target`);
    }
    if (targetProtein != null) {
      targetParts.push(`${Math.round(targetProtein)}g protein target`);
    }
    parts.push(`(targets: ${targetParts.join(", ")})`);
  }

  parts.push(`— ${meals} meal(s), ${snacks} snack(s)`);
  if (slots) {
    parts.push(`slots logged: ${slots}`);
  }
  if (data.adherence_score != null) {
    parts.push(`plan adherence: ${Math.round(num(data.adherence_score) * 100)}%`);
  }
  if (flags.length) {
    parts.push(`flags: ${flags.join(", ")}`);
  }

  return parts.join(" ");
}
