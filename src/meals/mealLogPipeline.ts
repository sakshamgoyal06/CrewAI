import { estimateMealNutrition } from "./estimateMealNutrition.js";
import { formatMealLogReply, targetIndicators } from "./formatMealLogReply.js";
import { loadDailyTargets, sumMealLogsForDay } from "./mealDaySummary.js";
import type { MealComponentForRow } from "./mealComponents.js";
import { recordMealSession } from "./recordMealLog.js";
import type { MealNutritionEstimate } from "./types.js";

/** @internal — covered by `mealLogPipeline.saveFailure.test.ts` */
export function formatMealLogSaveFailure(message: string): string {
  const lower = message.toLowerCase();
  const hint =
    lower.includes("relation") && lower.includes("does not exist")
      ? " Run migration `supabase/migrations/20260412180000_meal_logs.sql` in the Supabase SQL editor (or `supabase db push`)."
      : lower.includes("schema cache") || lower.includes("pgrst205")
        ? " Table may be missing: apply the `meal_logs` migration in Supabase."
        : lower.includes("meal_session_id") || lower.includes("component_index")
          ? " Apply migration `supabase/migrations/20260412210000_meal_session_and_daily_targets.sql` in Supabase."
          : "";
  return `Could not save meal log: ${message}.${hint}`;
}

function sumMealTotals(components: MealComponentForRow[]): {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
} {
  return {
    calories: components.reduce((s, c) => s + (c.calories ?? 0), 0),
    protein_g: components.reduce((s, c) => s + (c.protein_g ?? 0), 0),
    carbs_g: components.reduce((s, c) => s + (c.carbs_g ?? 0), 0),
    fat_g: components.reduce((s, c) => s + (c.fat_g ?? 0), 0),
  };
}

/**
 * Persist a precomputed nutrition estimate (e.g. per-component CalorieNinjas) and return the same * formatted Telegram reply as `completeMealLogFromPipeline`.
 */
export async function completeMealLogWithEstimate(input: {
  userProfileId: string;
  rawMealText: string;
  estimate: MealNutritionEstimate;
}): Promise<
  | { ok: true; reply: string; mealSessionId: string }
  | { ok: false; reply: string }
> {
  try {
    const estimate = input.estimate;
    const saved = await recordMealSession({
      userProfileId: input.userProfileId,
      rawText: input.rawMealText,
      estimate,
      sourceChannel: "telegram",
    });

    if (!saved.ok) {
      return { ok: false, reply: formatMealLogSaveFailure(saved.error) };
    }

    const mealTotals = sumMealTotals(saved.components);
    const day = await sumMealLogsForDay(input.userProfileId, saved.date);
    const targets = await loadDailyTargets(input.userProfileId);

    if (estimate.calories === null) {
      const lines = [
        `**Meal** \`${saved.mealSessionId.slice(0, 8)}…\` — logged without calorie estimate.`,
        `Components: ${saved.components.length} row(s).`,
        "",
        "**Today so far (UTC)**",
        `${Math.round(day.calories)} kcal · P ${day.protein_g}g · C ${day.carbs_g}g · F ${day.fat_g}g`,
      ];
      const ind = targetIndicators(day, targets);
      if (ind.length > 0) {
        lines.push("", "**Targets**", ...ind);
      }
      lines.push(
        "",
        "Set CALORIENINJAS_API_KEY and/or USDA_FDC_API_KEY (see .env.example). Optional: HEALTHIFYME_PROXY_URL, or MAGNUS_MEAL_LOG_LLM_FALLBACK=true.",
      );
      return { ok: true, reply: lines.join("\n"), mealSessionId: saved.mealSessionId };
    }

    const reply = formatMealLogReply({
      mealSessionId: saved.mealSessionId,
      loggedDate: saved.date,
      rawText: input.rawMealText,
      estimate,
      components: saved.components,
      mealTotals,
      day,
      targets,
    });

    return { ok: true, reply, mealSessionId: saved.mealSessionId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, reply: `Meal log failed: ${msg}` };
  }
}

/**
 * Estimate + persist + formatted reply. `nutritionQuery` may differ from `rawMealText`
 * (e.g. after the Nutrition agent normalizes wording for CalorieNinjas).
 */
export async function completeMealLogFromPipeline(input: {
  userProfileId: string;
  rawMealText: string;
  nutritionQuery: string;
}): Promise<
  | { ok: true; reply: string; mealSessionId: string }
  | { ok: false; reply: string }
> {
  try {
    const estimate = await estimateMealNutrition(input.nutritionQuery.trim());
    return completeMealLogWithEstimate({
      userProfileId: input.userProfileId,
      rawMealText: input.rawMealText,
      estimate,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, reply: `Meal log failed: ${msg}` };
  }
}
