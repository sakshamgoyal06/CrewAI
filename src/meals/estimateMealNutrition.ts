import type { MealNutritionEstimate } from "./types.js";
import { mealLogHealthifyProxyConfigured, mealLogLlmFallbackEnabled } from "./mealEnv.js";
import { estimateViaCalorieNinjas } from "./providers/calorieNinjas.js";
import { estimateViaHealthifyMeProxy } from "./providers/healthifyMeProxy.js";
import { estimateViaLlm } from "./providers/llmEstimate.js";
import { estimateViaUsdaFdc } from "./providers/usdaFdc.js";

/**
 * Default: **CalorieNinjas → USDA FDC** (practical APIs; no Anthropic tokens).
 * Optional: HealthifyMe-compatible proxy if `HEALTHIFYME_PROXY_URL` is set (after APIs).
 * Optional: LLM JSON estimate only if `MAGNUS_MEAL_LOG_LLM_FALLBACK=true`.
 */
export async function estimateMealNutrition(
  query: string,
): Promise<MealNutritionEstimate> {
  const q = query.trim();
  if (!q) {
    return unavailable("empty query");
  }

  const cn = await estimateViaCalorieNinjas(q);
  if (cn && cn.calories !== null) {
    return cn;
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
  };
}
