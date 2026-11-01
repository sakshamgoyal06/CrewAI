/** User disputes a calorie total — show history, do not log as food. */
const MEAL_CALORIE_DISPUTE_RE =
  /\b(?:(?:that'?s|it'?s|this\s+is|total\s+is)\s+)?(?:not|isn'?t|ain'?t|wrong|incorrect)\b[\s\S]{0,40}\b(?:\d[\d,]*\s*(?:kcal|cal(?:orie)?s?)|(?:the\s+)?(?:total|count|number))\b|\b(?:\d[\d,]*\s*(?:kcal|cal(?:orie)?s?)\s+is\s+(?:wrong|incorrect|not\s+right))\b/i;

export function isMealCalorieDisputeMessage(message: string): boolean {
  const t = message.trim();
  if (t.length < 8 || t.length > 200) {
    return false;
  }
  return MEAL_CALORIE_DISPUTE_RE.test(t);
}
