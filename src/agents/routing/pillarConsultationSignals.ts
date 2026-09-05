/**
 * Pillar consultation types — pillar list comes from the routing context parser (LLM).
 */
import type { RoutingChatTurn } from "./magnusToolContinuation.js";
import type { RoutingContextSignals } from "./routingContextParser.js";

export type ConsultablePillarIntent = "HEALTH" | "WEALTH" | "HAPPINESS" | "WISDOM";

/** Pillars to consult on a GENERAL turn — from routing context parser output. */
export function resolvePillarsToConsultOnGeneral(input: {
  userMessage: string;
  recentTurns?: RoutingChatTurn[];
  routingContext?: RoutingContextSignals;
}): ConsultablePillarIntent[] {
  return input.routingContext?.consult_pillars ?? [];
}

/** @deprecated Use resolvePillarsToConsultOnGeneral(...).includes("HEALTH") */
export function shouldConsultHealthOnGeneral(input: {
  userMessage: string;
  recentTurns?: RoutingChatTurn[];
  routingContext?: RoutingContextSignals;
}): boolean {
  return resolvePillarsToConsultOnGeneral(input).includes("HEALTH");
}

/** Used by agentConsultation outcome scoring — routing context supplies pillar signals. */
export function messageHasPillarSignal(
  message: string,
  pillar: ConsultablePillarIntent,
  routingContext?: RoutingContextSignals,
): boolean {
  if (routingContext?.consult_pillars.includes(pillar)) {
    return true;
  }
  return false;
}
