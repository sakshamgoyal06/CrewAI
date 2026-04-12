import { estimateMealNutrition } from "./estimateMealNutrition.js";
import { parseMealLogCommand } from "./parseMealLogCommand.js";
import { recordMealLog } from "./recordMealLog.js";

export type MealLogCommandResult =
  | { handled: false }
  | { handled: true; reply: string };

function fmt(n: number | null, unit: string): string {
  if (n === null || Number.isNaN(n)) {
    return "—";
  }
  return `${Math.round(n * 10) / 10}${unit}`;
}

/**
 * If the message is a meal-log command, estimate nutrition, persist, return a confirmation.
 * Otherwise returns `handled: false` so normal orchestration runs.
 */
export async function tryProcessMealLog(input: {
  userMessage: string;
  userProfileId: string;
}): Promise<MealLogCommandResult> {
  const parsed = parseMealLogCommand(input.userMessage);
  if (parsed.kind !== "meal") {
    return { handled: false };
  }

  try {
    const estimate = await estimateMealNutrition(parsed.text);
    const saved = await recordMealLog({
      userProfileId: input.userProfileId,
      rawText: parsed.text,
      estimate,
      sourceChannel: "telegram",
    });

    if (!saved.ok) {
      return {
        handled: true,
        reply: `Could not save meal log: ${saved.error}`,
      };
    }

    if (estimate.calories === null) {
      return {
        handled: true,
        reply:
          `Logged meal (id ${saved.id.slice(0, 8)}…) — could not estimate calories. ` +
          `Set CALORIENINJAS_API_KEY and/or USDA_FDC_API_KEY (see .env.example). ` +
          `Optional: HEALTHIFYME_PROXY_URL, or MAGNUS_MEAL_LOG_LLM_FALLBACK=true for Claude estimates (uses tokens).`,
      };
    }

    const lines = [
      `Logged meal · ~${fmt(estimate.calories, " kcal")}`,
      `P ${fmt(estimate.protein_g, "g")} · C ${fmt(estimate.carbs_g, "g")} · F ${fmt(estimate.fat_g, "g")}`,
      `Source: ${estimate.source}`,
    ];

    return {
      handled: true,
      reply: lines.join("\n"),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      handled: true,
      reply: `Meal log failed: ${msg}`,
    };
  }
}
