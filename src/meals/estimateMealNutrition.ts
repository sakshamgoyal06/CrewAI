import type { MealNutritionEstimate } from "./types.js";
import {
  mealLogHealthifyProxyConfigured,
  mealLogLlmFallbackEnabled,
  mealLogWebResearchEnabled,
} from "./mealEnv.js";
import { estimateViaCalorieNinjas } from "./providers/calorieNinjas.js";
import { estimateViaHealthifyMeProxy } from "./providers/healthifyMeProxy.js";
import { estimateViaLlm } from "./providers/llmEstimate.js";
import { estimateViaUsdaFdc } from "./providers/usdaFdc.js";
import { estimateViaWebResearch } from "./providers/webResearchEstimate.js";

/**
 * Default order: **Web (Anthropic web_search, then optional SerpAPI + excerpts + Claude) → USDA FDC → Healthify proxy → CalorieNinjas → optional LLM JSON**.
 * Web runs when `MAGNUS_MEAL_LOG_WEB_FIRST` is not false and Anthropic web search is allowed (default) and/or a SerpAPI key is set. See `mealEnv.mealLogWebResearchEnabled`.
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

  if (mealLogHealthifyProxyConfigured()) {
    const proxy = await estimateViaHealthifyMeProxy(q);
    if (proxy && proxy.calories !== null) {
      return proxy;
    }
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
