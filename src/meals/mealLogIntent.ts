import { isMealCalorieDisputeMessage } from "./mealCalorieDispute.js";
import { sanitizeMealLogRawText } from "./sanitizeMealLogRawText.js";

const PAST_MEAL_RE =
  /\b(?:(?:i|we)\s+)?(?:ate|eaten|had|just\s+had|finished\s+eating|only\s+had)\b|\b(?:for\s+)?(?:breakfast|lunch|dinner|snack)\b[^.\n]{0,40}\b(?:had|ate)\b/i;

const FUTURE_MEAL_RE =
  /\b(?:will\s+(?:eat|have|be)|'?ll\s+(?:eat|have)|going\s+to\s+(?:eat|have)|plan\s+to\s+eat)\b|\b(?:today|tomorrow)\b[^.\n]{0,60}\b(?:ill|i'll)\s+(?:eat|have)\b/i;

const MEAL_PLANNING_RE =
  /\b(?:meal\s+plan|plan\s+my\s+meals|save\s+plan|draft\s+plan|lock\s+(?:the\s+)?plan)\b/i;

const LOG_SLOT_PREFIX_RE =
  /^log\s+(?:breakfast|lunch|dinner|snack|afternoon\s+tea|tea)\s*:?\s*/i;

/** User is describing future/planned eating — must not write meal_logs. */
export function isMealPlanningIntent(message: string): boolean {
  const t = message.trim();
  if (!t) {
    return false;
  }
  if (MEAL_PLANNING_RE.test(t)) {
    return true;
  }
  if (PAST_MEAL_RE.test(t)) {
    return false;
  }
  return FUTURE_MEAL_RE.test(t);
}

/** Parser/step scaffolding — not food the user ate. */
export function isMealLogScaffoldingText(text: string): boolean {
  const t = text.trim();
  if (!t) {
    return true;
  }
  if (isMealCalorieDisputeMessage(t)) {
    return true;
  }
  if (/^log\s+(?:afternoon\s+)?tea\b/i.test(t)) {
    return true;
  }
  if (/^log\s+samosa\s+and\s+tea\s+as\s+a\s+meal\b/i.test(t)) {
    return true;
  }
  return false;
}

/** Strip log-slot prefixes and scaffolding; null when nothing valid to log. */
export function normalizeMealLogText(text: string): string | null {
  let t = sanitizeMealLogRawText(text).trim();
  if (!t || isMealLogScaffoldingText(t)) {
    return null;
  }

  t = t.replace(LOG_SLOT_PREFIX_RE, "").trim();
  if (!t || isMealLogScaffoldingText(t)) {
    return null;
  }

  return t.length >= 2 ? t : null;
}
