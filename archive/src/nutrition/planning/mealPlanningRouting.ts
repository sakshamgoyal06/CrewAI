/**
 * Helpers for the multi-turn meal planning journey (cancel phrases, message cleanup).
 * Routing to create vs read vs continue is handled by the pillar strategy parser — not regex gates.
 */
export const MEAL_PLAN_CANCEL_RE =
  /\b(?:cancel\s+(?:planning|plan)|never\s*mind|stop\s+planning|abort\s+plan)\b/i;

export function isMealPlanCancelMessage(rawMessage: string): boolean {
  return MEAL_PLAN_CANCEL_RE.test(rawMessage.trim());
}

/** Strip pillar plan step context so journey handlers see the user's words only. */
export function sanitizeMealPlanningUserMessage(rawMessage: string): string {
  const trimmed = rawMessage.trim();
  const markers = [
    trimmed.indexOf("\n\n---\nStep focus:"),
    trimmed.indexOf("\n\n---\nPrior steps completed:"),
  ].filter((i) => i >= 0);
  if (markers.length === 0) {
    return trimmed;
  }
  return trimmed.slice(0, Math.min(...markers)).trim();
}
