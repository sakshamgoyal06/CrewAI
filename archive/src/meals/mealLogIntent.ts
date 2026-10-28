import { isMealCalorieDisputeMessage } from "./mealCalorieDispute.js";
import { sanitizeMealLogRawText } from "./sanitizeMealLogRawText.js";
import { parseMealLogCommand } from "./parseMealLogCommand.js";
import type { MealSlot } from "./parseMealLogCommand.js";

const PAST_MEAL_RE =
  /\b(?:(?:i|we)\s+)?(?:ate|eaten|had|just\s+had|finished\s+eating|only\s+had)\b|\b(?:for\s+)?(?:breakfast|lunch|dinner|snack)\b[^.\n]{0,40}\b(?:had|ate)\b/i;

/** Present-tense eating ("I'm having/eating X") — log, not plan. */
const PRESENT_MEAL_RE =
  /\b(?:i'?m|i am|we'?re|we are)\s+(?:having|eating)\b/i;

const FUTURE_MEAL_RE =
  /\b(?:will\s+(?:eat|have|be)|'?ll\s+(?:eat|have)|going\s+to\s+(?:eat|have)|plan\s+to\s+eat)\b|\b(?:today|tomorrow)\b[^.\n]{0,60}\b(?:ill|i'll)\s+(?:eat|have)\b/i;

const MEAL_SLOT_RE = /\b(?:for\s+)?(breakfast|lunch|dinner|snack)\b/i;

const MEAL_PLANNING_RE =
  /\b(?:meal\s+plan|plan\s+my\s+meals|save\s+plan|draft\s+plan|lock\s+(?:the\s+)?plan)\b/i;

const LOG_SLOT_PREFIX_RE =
  /^log\s+(?:breakfast|lunch|dinner|snack|afternoon\s+tea|tea)\s*:?\s*/i;

/** Parser/step scaffolding from multi-step meal_log — never real food the user ate. */
const PARSER_LOG_SLOT_LINE_RE =
  /^log\s+(?:breakfast|lunch|dinner|snack|afternoon\s+tea|tea)\b/i;

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
  if (PRESENT_MEAL_RE.test(t)) {
    return false;
  }
  return FUTURE_MEAL_RE.test(t);
}

/** User is logging food they ate (not reading history or planning future meals). */
export function isMealLogWriteIntent(message: string): boolean {
  const t = message.trim();
  if (!t || isMealPlanningIntent(t)) {
    return false;
  }
  if (parseMealLogCommand(t).kind === "meal") {
    return true;
  }
  return PAST_MEAL_RE.test(t) || PRESENT_MEAL_RE.test(t);
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
  if (PARSER_LOG_SLOT_LINE_RE.test(t)) {
    return true;
  }
  if (/^log\s+.+\s+as\s+a\s+meal\b/i.test(t)) {
    return true;
  }
  return false;
}

function cleanFoodTail(raw: string): string | null {
  const food = raw.replace(/[.!?]+$/, "").trim();
  return food.length >= 2 ? food : null;
}

/** Prefer the user's own words when they said what they ate (not parser step text). */
export function extractPastMealFoodText(message: string): string | null {
  const t = sanitizeMealLogRawText(message).trim();

  const startPast = t.match(/^\s*(?:i|we)\s+(?:just\s+)?(?:ate|had|eaten)\s+(.+)$/i);
  if (startPast?.[1]) {
    return cleanFoodTail(startPast[1]);
  }

  const anywherePast = t.match(/\b(?:i|we)\s+(?:just\s+)?(?:ate|had|eaten)\s+(.+)$/i);
  if (anywherePast?.[1]) {
    return cleanFoodTail(anywherePast[1]);
  }

  const having = t.match(/\b(?:i'?m|i am|we'?re|we are)\s+(?:having|eating)\s+(.+)$/i);
  if (having?.[1]) {
    return cleanFoodTail(having[1]);
  }

  return null;
}

/** Extract meal slot from natural phrasing ("for breakfast today", "in lunch"). */
export function extractMealSlotFromMessage(message: string): MealSlot | undefined {
  const m = message.match(MEAL_SLOT_RE);
  if (!m?.[1]) {
    return undefined;
  }
  const slot = m[1].toLowerCase();
  if (slot === "breakfast" || slot === "lunch" || slot === "dinner" || slot === "snack") {
    return slot;
  }
  return undefined;
}

/**
 * Best-effort food text when strict normalize fails — used for confirmation prompts.
 */
export function inferMealLogCandidate(message: string): {
  foodText: string;
  mealSlot?: MealSlot;
} | null {
  const extracted = extractPastMealFoodText(message);
  const mealSlot = extractMealSlotFromMessage(message);
  if (extracted) {
    return { foodText: extracted, mealSlot };
  }

  const t = sanitizeMealLogRawText(message).trim();
  const withoutSlot = t
    .replace(/^(?:for\s+)?(?:breakfast|lunch|dinner|snack)\b[^,.\n]{0,30}[,:]?\s*/i, "")
    .replace(/\b(?:today|this morning|this afternoon|this evening)\b/gi, "")
    .trim();

  if (withoutSlot.length >= 4 && /\b(?:besan|cheela|paratha|rice|dal|tea|coffee|egg|chicken|salad|sabzi|roti|chapati)\b/i.test(withoutSlot)) {
    return { foodText: withoutSlot, mealSlot };
  }

  return null;
}

/** User is correcting timing/slots for already-logged meals — not logging new food. */
const MEAL_SLOT_CORRECTION_RE =
  /\b(?:was\s+(?:in|at)|not\s+(?:mid|in)\s*(?:morning|afternoon)|should\s+be|wrong\s+(?:slot|meal)|in\s+(?:the\s+)?evening|at\s+lunch|lunch\s+had|had\s+a\s+tea\s+too|move(?:d)?\s+(?:it\s+)?to)\b/i;

export function isMealSlotCorrectionMessage(message: string): boolean {
  const t = message.trim();
  if (!t || isMealLogScaffoldingText(t)) {
    return false;
  }
  if (extractPastMealFoodText(t)) {
    return false;
  }
  return MEAL_SLOT_CORRECTION_RE.test(t);
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
