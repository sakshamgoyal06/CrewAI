import type { MealNutritionEstimate } from "./types.js";
import { mealLogLlmFallbackEnabled, mealLogWebResearchEnabled } from "./mealEnv.js";
import { estimateViaCalorieNinjas } from "./providers/calorieNinjas.js";
import { estimateViaLlm } from "./providers/llmEstimate.js";
import { estimateViaUsdaFdc } from "./providers/usdaFdc.js";
import { estimateViaWebResearch } from "./providers/webResearchEstimate.js";
import { estimateFromItems, estimateWithFoodDb, type ParsedFoodItem } from "./foodDbEstimate.js";
import { breakdownViaWebResearch } from "./providers/webBreakdown.js";
import type { FoodContributor } from "./foodStore.js";

export type EstimateOptions = {
  /** false skips every web lookup (the person's monthly lookups are used up). Default true. */
  webAllowed?: boolean;
  /** Called once for each paid web lookup, before it runs. */
  onWebLookup?: () => void;
  /** Who is logging. Their unconfirmed web foods are used only for them (see foodStore.ts). */
  contributor?: FoodContributor;
  /**
   * "Can't find it? Search": the person already looked in the food list and it wasn't there, so
   * go straight to the web instead of rebuilding the dish from the food table (which turns
   * "boondi raita" back into plain raita). Falls back to the usual order only when the web is off.
   */
  webFirst?: boolean;
  /**
   * The foods already read from the message by the coach (food, amount, detail). Each is looked up
   * as given, catalog then food table then web, with no splitting of the text.
   */
  items?: ParsedFoodItem[];
};

/**
 * Order: **ingredients from our food table (web_search breaks down unseen items) → USDA FDC → CalorieNinjas → optional Claude JSON**. Web runs
 * unless `MAGNUS_MEAL_LOG_WEB_FIRST=false`; the LLM fallback only with `MAGNUS_MEAL_LOG_LLM_FALLBACK=true`.
 */
export async function estimateMealNutrition(
  query: string,
  opts: EstimateOptions = {},
): Promise<MealNutritionEstimate> {
  const q = query.trim();
  if (!q) {
    return unavailable("empty query");
  }
  // Web results are cached per person: one person's lookup is never served to another.
  // A web-first lookup never reuses a food-table answer for the same words.
  const parsed = opts.items?.length ? `items|${estimateCacheKey(JSON.stringify(opts.items))}|` : "";
  const shared = `${opts.webFirst ? "web|" : ""}${parsed}${estimateCacheKey(q)}`;
  const own = `${opts.contributor?.id ?? "-"}|${shared}`;
  for (const k of [shared, own]) {
    const hit = estimateCache.get(k);
    if (hit && Date.now() - hit.at < ESTIMATE_CACHE_TTL_MS) {
      return hit.estimate;
    }
  }
  const estimate = await estimateUncached(q, opts);
  if (estimate.calories !== null) {
    const key = estimate.source === "web_research" ? own : shared;
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

async function estimateUncached(q: string, opts: EstimateOptions): Promise<MealNutritionEstimate> {
  const webEnabled = mealLogWebResearchEnabled() && opts.webAllowed !== false;
  if (opts.webFirst && webEnabled) {
    opts.onWebLookup?.();
    const web = await estimateViaWebResearch(q);
    if (web && web.calories !== null) {
      return web;
    }
    return (await outsideSources(q)) ?? unavailable("web lookup found nothing");
  }
  // Built from ingredients in our food table; only unseen items go to the web (and get saved).
  let webTried = false;
  const breakdown = webEnabled
    ? (text: string, items: Parameters<typeof breakdownViaWebResearch>[1], known: string[]) => {
        webTried = true;
        opts.onWebLookup?.();
        return breakdownViaWebResearch(text, items, known);
      }
    : null;
  const fromDb = await (opts.items?.length
    ? estimateFromItems(q, opts.items, breakdown, { contributor: opts.contributor })
    : estimateWithFoodDb(q, breakdown, { contributor: opts.contributor })
  ).catch(() => null);
  if (fromDb && fromDb.calories !== null) {
    return fromDb;
  }

  // Don't pay for a second web search when the first one already failed.
  if (webEnabled && !webTried) {
    opts.onWebLookup?.();
    const web = await estimateViaWebResearch(q);
    if (web && web.calories !== null) {
      return web;
    }
  }

  return (await outsideSources(q)) ?? unavailable("no provider returned calories");
}

/** USDA FDC → CalorieNinjas → optional Claude JSON: the sources after our table and the web. */
async function outsideSources(q: string): Promise<MealNutritionEstimate | null> {
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
  return null;
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
