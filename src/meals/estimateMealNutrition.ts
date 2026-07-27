import type { MealNutritionEstimate } from "./types.js";
import { mealLogLlmFallbackEnabled, mealLogWebResearchEnabled } from "./mealEnv.js";
import { estimateViaCalorieNinjas } from "./providers/calorieNinjas.js";
import { estimateViaLlm } from "./providers/llmEstimate.js";
import { estimateViaUsdaFdc } from "./providers/usdaFdc.js";
import { estimateViaWebResearch } from "./providers/webResearchEstimate.js";

/**
 * Order: **Anthropic web_search → USDA FDC → CalorieNinjas → optional Claude JSON**. Web runs
 * unless `MAGNUS_MEAL_LOG_WEB_FIRST=false`; the LLM fallback only with `MAGNUS_MEAL_LOG_LLM_FALLBACK=true`.
 */
export async function estimateMealNutrition(
  query: string,
): Promise<MealNutritionEstimate> {
  const q = query.trim();
  if (!q) {
    return unavailable("empty query");
  }

  if (mealLogWebResearchEnabled()) {
    const web = await estimateViaWebResearch(q);
    if (web && web.calories !== null) {
      return web;
    }
  }

  const usda = await estimateViaUsdaFdc(q);
  if (usda && usda.calories !== null) {
    return usda;
  }

  const cn = await estimateViaCalorieNinjas(q);
  if (cn && cn.calories !== null) {
    return cn;
  }

  if (mealLogLlmFallbackEnabled()) {
    const llm = await estimateViaLlm(q);
    if (llm && llm.calories !== null) {
      return llm;
    }
  }

  return unavailable("no provider returned calories");
}

function unavailable(reason: string): MealNutritionEstimate {
  return {
    calories: null,
    protein_g: null,
    carbs_g: null,
    fat_g: null,
    items: [],
    source: "unavailable",
    providerRaw: { reason },
    serving_assumption: null,
  };
}
