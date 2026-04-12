/**
 * Meal logging uses practical APIs first (CalorieNinjas, USDA FDC).
 * Optional: HealthifyMe-compatible proxy, LLM estimate (extra Anthropic tokens).
 */

export function mealLogLlmFallbackEnabled(): boolean {
  return process.env.MAGNUS_MEAL_LOG_LLM_FALLBACK?.trim().toLowerCase() === "true";
}

export function mealLogHealthifyProxyConfigured(): boolean {
  return Boolean(process.env.HEALTHIFYME_PROXY_URL?.trim());
}
