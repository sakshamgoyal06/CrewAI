import type { RoutingChatTurn } from "./magnusToolContinuation.js";

const MEAL_SLOT_ONLY_RE =
  /^(?:what about |how about |and )?(?:breakfast|lunch|dinner|snack)\??$/i;

const MEAL_CONTEXT_RE =
  /\bmeal\s+plan\b|\bplanned\s+meals?\b|\bkcal\b|\bprotein\b|\bmacros?\b|\bmeal\s+breakdown\b/i;

/** Short follow-up asking about one meal slot after a meal-plan or meal-history turn. */
export function looksLikeMealSlotFollowUp(message: string): boolean {
  return MEAL_SLOT_ONLY_RE.test(message.trim());
}

export function recentTurnWasMealContext(recentTurns: RoutingChatTurn[]): boolean {
  const lastAssistant = [...recentTurns].reverse().find((t) => t.role === "assistant");
  if (!lastAssistant) {
    return false;
  }
  return MEAL_CONTEXT_RE.test(lastAssistant.content);
}
