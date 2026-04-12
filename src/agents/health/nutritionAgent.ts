import type { AgentContext, AgentResult } from "../types.js";
import { runOrchestratedNutritionAdviceTurn } from "./nutritionOrchestrated.js";

export { NUTRITION_SYSTEM } from "./nutritionPrompt.js";

const NUTRITION_PATTERN =
  /\b(meals?|macro|macros|calorie|calories|proteins?|protein|carbs?|diet|diets|breakfast|lunch|dinner|snacks?|fasting|nutrition|foods?|eat(ing)?|gluten|keto|vegan|vegetarian|sugar|supplements?|vitamins?|hydration|hydrate|water\b|intermittent\s+fasting|meal\s+prep)\b/i;

export function matchesNutritionMessage(rawMessage: string): boolean {
  return NUTRITION_PATTERN.test(rawMessage);
}

/** Used by `healthRouter` (Fitness → Nutrition → Energy). Not a separate registry agent. */
export async function tryNutritionAgent(ctx: AgentContext): Promise<AgentResult | null> {
  if (!matchesNutritionMessage(ctx.rawMessage)) {
    return null;
  }
  return runOrchestratedNutritionAdviceTurn(ctx);
}
