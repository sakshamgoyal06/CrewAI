import type { Message } from "@anthropic-ai/sdk/resources/messages/messages.js";

import { anthropic } from "../../tools/clients.js";
import { augmentUserWithMemory } from "../memory/memoryAgent.js";
import { SPECIALIST_USER_IDENTITY } from "../promptIdentity.js";
import { isMealCommand } from "../../meals/parseMealLogCommand.js";
import type { AgentContext, AgentResult } from "../types.js";
import { HEALTH_SPECIALIST_MODEL } from "./model.js";

/**
 * Meal **planning** (day/week ideas from stated constraints). Not the meal **log** pipeline
 * (`mealLogPipeline`, `/meal` commands). For optional nutrition lookups elsewhere in Magnus,
 * providers may use env such as `CALORIENINJAS_API_KEY` — this agent does not call those APIs.
 */
export const MEAL_PLANNER_SYSTEM = `You are the Meal Planner specialist for Magnus (Health pillar).

${SPECIALIST_USER_IDENTITY}

**Scope:** Suggest **meal ideas and structure** for a **day or a week** from the user's goals and constraints (time, budget band, cuisine, cooking skill, allergies, intolerances, dietary pattern, calorie or macro targets when they mention them). Output practical options — not medical nutrition therapy.

**Not your job:** Logging foods, estimating calories from arbitrary logs, or parsing /meal-style commands. If the user seems to be logging what they ate, you would not handle that here — but normally you will not see that in this mode.

**Tone:** Supportive, no food shame. Treat stated allergies or hard dietary limits as requirements. You are not a doctor or registered dietitian; for clinical conditions or prescribed diets, encourage professional care.

Keep replies focused; default under ~250 words unless they ask for a detailed week grid.`;

/** True when the user is asking for structured meal planning (vs generic nutrition chat or meal logging). */
const MEAL_PLANNER_PATTERN =
  /\b(?:meal\s+plan(?:ning)?|plan\s+my\s+meals|weekly\s+menu|menu\s+for\s+the\s+week|weekly\s+meal\s+ideas?|meals?\s+for\s+(?:this|the)\s+week|meals?\s+for\s+(?:today|tomorrow|the\s+day)|week\s+of\s+meals|a\s+week\s+of\s+meals|meal\s+ideas?\s+for\s+(?:this\s+)?(?:week|the\s+week)|what\s+(?:should|to)\s+(?:I\s+)?eat\s+(?:this\s+)?week|day\s+of\s+eating|meal\s+prep\s+(?:for\s+)?(?:the\s+)?week|prep\s+meals?\s+for\s+the\s+week|breakfast\s+through\s+dinner|(?:suggest|give\s+me)\s+(?:some\s+)?(?:meal\s+)?ideas?\s+for\s+(?:this\s+)?(?:week|the\s+week|today|tomorrow)|food\s+plan\s+for\s+the\s+week)\b/i;

export function matchesMealPlannerMessage(rawMessage: string): boolean {
  return MEAL_PLANNER_PATTERN.test(rawMessage);
}

function textFromMessage(msg: Message): string {
  for (const block of msg.content) {
    if (block.type === "text") {
      return block.text;
    }
  }
  return "";
}

function optionalProfileBlock(ctx: AgentContext): string {
  const parts: string[] = [];
  if (ctx.northStarGoal?.trim()) {
    parts.push(`North star (from profile): ${ctx.northStarGoal.trim()}`);
  }
  if (ctx.timezone?.trim()) {
    parts.push(`Timezone (from profile): ${ctx.timezone.trim()}`);
  }
  if (parts.length === 0) {
    return "";
  }
  return `\n\n${parts.join("\n")}`;
}

/**
 * Returns a meal-planning reply when the message asks for day/week meal ideas; otherwise `null`.
 * Explicit meal-log syntax (`/meal`, `meal:`, etc.) yields `null` so the logging pipeline can own those turns.
 */
export async function tryMealPlannerAgent(ctx: AgentContext): Promise<AgentResult | null> {
  if (isMealCommand(ctx.rawMessage)) {
    return null;
  }
  if (!matchesMealPlannerMessage(ctx.rawMessage)) {
    return null;
  }

  const prefs = ctx.healthPreferences?.trim() ? `\n\nHealth preferences (onboarding): ${ctx.healthPreferences.trim()}` : "";
  const profileBlock = optionalProfileBlock(ctx);
  const msg = await anthropic.messages.create({
    model: HEALTH_SPECIALIST_MODEL,
    max_tokens: 1024,
    system: MEAL_PLANNER_SYSTEM,
    messages: [
      {
        role: "user",
        content: augmentUserWithMemory(
          `${ctx.rawMessage}${prefs}${profileBlock}`,
          ctx.memoryBlock,
        ),
      },
    ],
  });
  const text = textFromMessage(msg).trim() || "…";
  return {
    text,
    metadata: {
      specialist: "MealPlanner",
      department: "nutrition",
      pillar: "health",
      sub_kind: "meal_plan",
    },
  };
}
