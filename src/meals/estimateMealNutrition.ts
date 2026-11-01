import type { MealNutritionEstimate } from "./types.js";
import { mealLogLlmFallbackEnabled, mealLogWebResearchEnabled } from "./mealEnv.js";
import { estimateViaCalorieNinjas } from "./providers/calorieNinjas.js";
import { estimateViaLlm } from "./providers/llmEstimate.js";
import { estimateViaUsdaFdc } from "./providers/usdaFdc.js";
import { estimateViaWebResearch } from "./providers/webResearchEstimate.js";
import { estimateWithFoodDb } from "./foodDbEstimate.js";
import { breakdownViaWebResearch } from "./providers/webBreakdown.js";

/**
 * Order: **ingredients from our food table (web_search breaks down unseen items) → USDA FDC → CalorieNinjas → optional Claude JSON**. Web runs
 * unless `MAGNUS_MEAL_LOG_WEB_FIRST=false`; the LLM fallback only with `MAGNUS_MEAL_LOG_LLM_FALLBACK=true`.
 */
export async function estimateMealNutrition(
  query: string,
): Promise<MealNutritionEstimate> {
  const q = query.trim();
  if (!q) {
    return unavailable("empty query");
  }
  const key = estimateCacheKey(q);
  const hit = estimateCache.get(key);
  if (hit && Date.now() - hit.at < ESTIMATE_CACHE_TTL_MS) {
    return hit.estimate;
  }
  const estimate = await estimateUncached(q);
  if (estimate.calories !== null) {
    estimateCache.delete(key);
    estimateCache.set(key, { at: Date.now(), estimate });
    if (estimateCache.size > ESTIMATE_CACHE_MAX) {
      estimateCache.delete(estimateCache.keys().next().value!);
    }
  }
  return estimate;
}

/**
 * Same meal text → same estimate for a day, so repeat meals (the usual breakfast) come back
 * instantly. The user still sees and can edit the card before anything is saved.
 */
const ESTIMATE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const ESTIMATE_CACHE_MAX = 300;
const estimateCache = new Map<string, { at: number; estimate: MealNutritionEstimate }>();

export function estimateCacheKey(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}.]+/gu, " ").trim();
}

export function clearEstimateCache(): void {
  estimateCache.clear();
}

async function estimateUncached(q: string): Promise<MealNutritionEstimate> {
  const webEnabled = mealLogWebResearchEnabled();
  // Built from ingredients in our food table; only unseen items go to the web (and get saved).
  let webTried = false;
  const fromDb = await estimateWithFoodDb(
    q,
    webEnabled
      ? (text, items, known) => {
          webTried = true;
          return breakdownViaWebResearch(text, items, known);
        }
      : null,
  ).catch(() => null);
  if (fromDb && fromDb.calories !== null) {
    return fromDb;
  }

  // Don't pay for a second web search when the first one already failed.
  if (webEnabled && !webTried) {
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
