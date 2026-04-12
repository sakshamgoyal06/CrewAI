import type { Message } from "@anthropic-ai/sdk/resources/messages/messages.js";

import { anthropic } from "../../tools/clients.js";
import { augmentUserWithMemory } from "../memory/memoryAgent.js";
import type { AgentContext, AgentResult, DepartmentAgent } from "../types.js";
import { HEALTH_SPECIALIST_MODEL } from "./model.js";

/**
 * Roster §6.3 — Nutrition: practical meals, no shame; respect allergies/constraints
 * stated in the user message.
 */
export const NUTRITION_SYSTEM = `You are the Nutrition agent for LifeOS. Offer practical meal ideas and adherence strategies; never shame or moralize about food. If the user states allergies, intolerances, or dietary constraints in their message, treat them as hard requirements. You are not a doctor or registered dietitian; for medical nutrition therapy or diagnosed conditions, encourage professional care. Keep replies focused and under ~200 words unless the user asks for detail.`;

/** Meal persistence uses `src/meals/mealLogCommand.ts` (`/meal`, `meal:`, `log meal:`). */
export async function recordMealLogPlaceholder(_ctx: AgentContext): Promise<void> {
  return;
}

const NUTRITION_PATTERN =
  /\b(meals?|macro|macros|calorie|calories|proteins?|protein|carbs?|diet|diets|breakfast|lunch|dinner|snacks?|fasting|nutrition|foods?|eat(ing)?|gluten|keto|vegan|vegetarian|sugar|supplements?|vitamins?|hydration|hydrate|water\b|intermittent\s+fasting|meal\s+prep)\b/i;

export function matchesNutritionMessage(rawMessage: string): boolean {
  return NUTRITION_PATTERN.test(rawMessage);
}

function textFromMessage(msg: Message): string {
  for (const block of msg.content) {
    if (block.type === "text") {
      return block.text;
    }
  }
  return "";
}

export async function tryNutritionAgent(ctx: AgentContext): Promise<AgentResult | null> {
  if (!matchesNutritionMessage(ctx.rawMessage)) {
    return null;
  }
  await recordMealLogPlaceholder(ctx);
  const msg = await anthropic.messages.create({
    model: HEALTH_SPECIALIST_MODEL,
    max_tokens: 512,
    system: NUTRITION_SYSTEM,
    messages: [
      {
        role: "user",
        content: augmentUserWithMemory(
          `${ctx.rawMessage}${ctx.healthPreferences ?? ""}`,
          ctx.memoryBlock,
        ),
      },
    ],
  });
  const text = textFromMessage(msg).trim() || "…";
  return {
    text,
    metadata: { specialist: "nutrition", department: "HEALTH" },
  };
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
