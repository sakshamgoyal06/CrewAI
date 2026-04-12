/**
 * Meal logging: optional web first (Anthropic web_search and/or SerpAPI + fetch excerpts + Claude),
 * then USDA / Healthify / CalorieNinjas / LLM.
 */

export function mealLogLlmFallbackEnabled(): boolean {
  return process.env.MAGNUS_MEAL_LOG_LLM_FALLBACK?.trim().toLowerCase() === "true";
}

export function mealLogHealthifyProxyConfigured(): boolean {
  return Boolean(process.env.HEALTHIFYME_PROXY_URL?.trim());
}

/**
 * Anthropic Messages API server tool `web_search` for meal estimates.
 * Off if `MAGNUS_MEAL_ANTHROPIC_WEB_SEARCH=false`. Requires web search enabled for the org in
 * [Claude Console](https://platform.claude.com/settings/privacy).
 */
export function mealLogAnthropicWebSearchEnabled(): boolean {
  const off = process.env.MAGNUS_MEAL_ANTHROPIC_WEB_SEARCH?.trim().toLowerCase();
  if (off === "false" || off === "0") {
    return false;
  }
  return true;
}

function serpApiConfigured(): boolean {
  return Boolean(
    process.env.MAGNUS_SERPAPI_KEY?.trim() || process.env.SERPAPI_API_KEY?.trim(),
  );
}

/**
 * Web-first meal estimates. On unless `MAGNUS_MEAL_LOG_WEB_FIRST=false`/`0`, if at least one of:
 * Anthropic web_search (default on), or SerpAPI key (fallback / legacy path).
 */
export function mealLogWebResearchEnabled(): boolean {
  const off = process.env.MAGNUS_MEAL_LOG_WEB_FIRST?.trim().toLowerCase();
  if (off === "false" || off === "0") {
    return false;
  }
  return mealLogAnthropicWebSearchEnabled() || serpApiConfigured();
}
