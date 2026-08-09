/**
 * Deterministic routing for the multi-turn meal planning journey.
 * Must run before pillar LLM parsers so cancel/save/skip and active sessions
 * are handled without intent misclassification or silent timeouts.
 */
import { matchesMealPlannerMessage } from "../../agents/health/mealPlannerPatterns.js";
import type { MealPlanSessionRow } from "./mealPlanningSessionStore.js";

export const MEAL_PLAN_CANCEL_RE =
  /\b(?:cancel\s+(?:planning|plan)|never\s*mind|stop\s+planning|abort\s+plan)\b/i;

export function isMealPlanCancelMessage(rawMessage: string): boolean {
  return MEAL_PLAN_CANCEL_RE.test(rawMessage.trim());
}

/** Route to meal planning — active session, cancel, or new planning ask. */
export function shouldRouteToMealPlanning(
  rawMessage: string,
  activeSession: MealPlanSessionRow | null,
): boolean {
  if (isMealPlanCancelMessage(rawMessage)) {
    return true;
  }
  if (activeSession) {
    return true;
  }
  return matchesMealPlannerMessage(rawMessage);
}
