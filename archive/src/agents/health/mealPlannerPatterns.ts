/** Patterns and legacy system string for meal planning triggers. */
export const MEAL_PLANNER_SYSTEM = `You are the Meal Planner specialist for Magnus (Health pillar).

**Scope:** Suggest **meal ideas and structure** for a **day or a week** from the user's goals and constraints.

**Note:** Production routing uses the multi-turn planning journey in \`mealPlanningAgent.ts\` (gather → draft → lock).`;

/** True when the user is asking for structured meal planning (vs generic nutrition chat or meal logging). */
export const MEAL_PLANNER_PATTERN =
  /\b(?:meal\s+plan(?:ning)?|plan\s+my\s+meals|weekly\s+menu|menu\s+for\s+the\s+week|weekly\s+meal\s+ideas?|meals?\s+for\s+(?:this|the)\s+week|meals?\s+for\s+(?:today|tomorrow|the\s+day)|week\s+of\s+meals|a\s+week\s+of\s+meals|meal\s+ideas?\s+for\s+(?:this\s+)?(?:week|the\s+week)|what\s+(?:should|to)\s+(?:I\s+)?eat\s+(?:this\s+)?week|day\s+of\s+eating|meal\s+prep\s+(?:for\s+)?(?:the\s+)?week|prep\s+meals?\s+for\s+the\s+week|breakfast\s+through\s+dinner|(?:suggest|give\s+me)\s+(?:some\s+)?(?:meal\s+)?ideas?\s+for\s+(?:this\s+)?(?:week|the\s+week|today|tomorrow)|food\s+plan\s+for\s+the\s+week)\b/i;

export function matchesMealPlannerMessage(rawMessage: string): boolean {
  return MEAL_PLANNER_PATTERN.test(rawMessage);
}
