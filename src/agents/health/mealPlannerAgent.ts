import type { Message } from "@anthropic-ai/sdk/resources/messages/messages.js";

import { anthropic } from "../../tools/clients.js";
import { localDateKey, timezoneAbbrev } from "../../nutrition/localDate.js";
import {
  extractMealPlanJson,
  offsetDateKey,
  stripMealPlanJsonBlock,
} from "../../nutrition/parseMealPlanJson.js";
import { savePlanEntries } from "../../nutrition/store/mealPlanStore.js";
import { buildAgentMessages } from "../memory/memoryAgent.js";
import { buildSpecialistIdentity } from "../promptIdentity.js";
import { isMealCommand } from "../../meals/parseMealLogCommand.js";
import type { AgentContext, AgentResult } from "../types.js";
import { HEALTH_SPECIALIST_MODEL } from "./model.js";
import { matchesMealPlanReadMessage } from "./mealPlanReadAgent.js";

/**
 * Meal **planning** (day/week ideas from stated constraints). Persists structured plans to
 * `meal_plan_entries` when the model returns valid JSON.
 */
export const MEAL_PLANNER_SYSTEM = `You are the Meal Planner specialist for Magnus (Health pillar).

**Scope:** Suggest **meal ideas and structure** for a **day or a week** from the user's goals and constraints (time, budget band, cuisine, cooking skill, allergies, intolerances, dietary pattern, calorie or macro targets when they mention them). Output practical options — not medical nutrition therapy.

**Not your job:** Logging foods, estimating calories from arbitrary logs, or parsing /meal-style commands.

**Tone:** Supportive, no food shame. Treat stated allergies or hard dietary limits as requirements.

Keep replies focused; default under ~250 words unless they ask for a detailed week grid.

**Saving plans:** After your human-readable plan, you MUST append a fenced JSON block so Magnus can save it:

\`\`\`json
{"entries":[{"local_date":"YYYY-MM-DD","meal_slot":"breakfast|lunch|dinner|snack","title":"Short meal name","description":"optional note"}]}
\`\`\`

Use the anchor date and timezone provided. Include one entry per planned slot. Dates must be YYYY-MM-DD.`;

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

function planAnchorBlock(ctx: AgentContext): string {
  const today = localDateKey(new Date(), ctx.timezone);
  const weekEnd = offsetDateKey(today, 6);
  const tz = timezoneAbbrev(ctx.timezone);
  return `\n\nPlan anchor: today is **${today}** (${tz}). For a week plan use ${today} through ${weekEnd}.`;
}

/**
 * Returns a meal-planning reply when the message asks for day/week meal ideas; otherwise `null`.
 */
export async function tryMealPlannerAgent(ctx: AgentContext): Promise<AgentResult | null> {
  if (isMealCommand(ctx.rawMessage)) {
    return null;
  }
  if (matchesMealPlanReadMessage(ctx.rawMessage)) {
    return null;
  }
  if (!matchesMealPlannerMessage(ctx.rawMessage)) {
    return null;
  }

  const prefs = ctx.healthPreferences?.trim() ? `\n\nHealth preferences (onboarding): ${ctx.healthPreferences.trim()}` : "";
  const profileBlock = optionalProfileBlock(ctx);
  const anchor = planAnchorBlock(ctx);
  const msg = await anthropic.messages.create({
    model: HEALTH_SPECIALIST_MODEL,
    max_tokens: 1536,
    system: `${buildSpecialistIdentity(ctx)}\n\n${MEAL_PLANNER_SYSTEM}`,
    messages: buildAgentMessages(ctx, `${ctx.rawMessage}${prefs}${profileBlock}${anchor}`),
  });
  const llmText = textFromMessage(msg).trim() || "…";
  const displayText = stripMealPlanJsonBlock(llmText) || llmText;
  const entries = extractMealPlanJson(llmText);

  if (!entries?.length) {
    return {
      text: `${displayText}\n\n_(Plan not saved — JSON block missing. Ask again or say "show my meal plan" after a successful save.)_`,
      metadata: {
        specialist: "MealPlanner",
        department: "nutrition",
        pillar: "health",
        sub_kind: "meal_plan",
        meal_plan_saved: false,
      },
    };
  }

  const saved = await savePlanEntries(ctx.userProfileId, entries, "chat");
  if (!saved.ok) {
    return {
      text: `${displayText}\n\n_(Could not save plan: ${saved.error})_`,
      metadata: {
        specialist: "MealPlanner",
        department: "nutrition",
        pillar: "health",
        sub_kind: "meal_plan",
        meal_plan_saved: false,
        error: saved.error,
      },
    };
  }

  const dateRange =
    saved.dates.length === 1
      ? saved.dates[0]
      : `${saved.dates[0]} → ${saved.dates[saved.dates.length - 1]}`;

  return {
    text: `${displayText}\n\n**Saved ${saved.savedCount} meal(s)** for ${dateRange}. Say "show my meal plan" anytime.`,
    metadata: {
      specialist: "MealPlanner",
      department: "nutrition",
      pillar: "health",
      sub_kind: "meal_plan",
      meal_plan_saved: true,
      saved_count: saved.savedCount,
      plan_dates: saved.dates,
    },
  };
}
