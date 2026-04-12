import type { AgentContext, AgentResult, DepartmentAgent } from "../types.js";
import { runOrchestratedNutritionAdviceTurn } from "./nutritionOrchestrated.js";

export { NUTRITION_SYSTEM } from "./nutritionPrompt.js";

const NUTRITION_PATTERN =
  /\b(meals?|macro|macros|calorie|calories|proteins?|protein|carbs?|diet|diets|breakfast|lunch|dinner|snacks?|fasting|nutrition|foods?|eat(ing)?|gluten|keto|vegan|vegetarian|sugar|supplements?|vitamins?|hydration|hydrate|water\b|intermittent\s+fasting|meal\s+prep)\b/i;

export function matchesNutritionMessage(rawMessage: string): boolean {
  return NUTRITION_PATTERN.test(rawMessage);
}

export async function tryNutritionAgent(ctx: AgentContext): Promise<AgentResult | null> {
  if (!matchesNutritionMessage(ctx.rawMessage)) {
    return null;
  }
  return runOrchestratedNutritionAdviceTurn(ctx);
}

/**
 * Nutrition specialist — `name` is `nutrition` per roster. HEALTH routing uses
 * `healthCompositeAgent` in `healthRouter.ts` (Fitness → Nutrition → Energy).
 */
export const nutritionDepartmentAgent: DepartmentAgent = {
  name: "nutrition",
  departmentId: "HEALTH",
  async run(ctx) {
    const r = await tryNutritionAgent(ctx);
    if (r) {
      return r;
    }
    return {
      text: "Ask about meals, macros, calories, protein, hydration, or dietary constraints for nutrition coaching.",
      metadata: { specialist: "nutrition", department: "HEALTH", noMatch: true },
    };
  },
};
