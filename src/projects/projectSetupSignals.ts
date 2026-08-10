/**
 * Structural signals for project setup routing (deterministic, no LLM).
 */
import type { RoutingHints } from "../agents/routing/pillarStrategy/types.js";

export const PROJECT_LOCK_RE =
  /^(?:yes|yep|looks good|lock it(?: in)?|confirm|go ahead|ship it|let'?s do it)\.?$/i;

export const PROJECT_CANCEL_RE =
  /\b(?:cancel|never mind|nevermind|stop planning|forget it|abort)\b/i;

export const PROJECT_SKIP_RE = /^(?:skip|nothing else|same as default)\.?$/i;

/** Active setup session → stay in project_setup FSM (lock, cancel, revisions, review). */
export function shouldContinueProjectSetup(
  hints: Pick<RoutingHints, "active_project_session">,
): boolean {
  return hints.active_project_session;
}
