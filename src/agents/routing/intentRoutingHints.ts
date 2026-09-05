/**
 * Intent routing hints — produced by the routing context parser (LLM), not regex.
 */
import type { RoutingChatTurn } from "./magnusToolContinuation.js";
import {
  parseRoutingContext,
  routingContextToIntentHints,
  type RoutingContextSignals,
} from "./routingContextParser.js";

export type IntentRoutingHints = {
  explicit_meal_log: boolean;
  looks_like_meal_log_read: boolean;
  looks_like_youtube_action: boolean;
  looks_like_magnus_tool_action: boolean;
  looks_like_magnus_tool_continuation: boolean;
  looks_like_health_fitness_read: boolean;
  looks_like_wealth_portfolio_read: boolean;
  holistic_day_ask: boolean;
  saved_media_pick: boolean;
  schedule_accuracy_challenge: boolean;
  compound_action: boolean;
};

export async function buildIntentRoutingHints(
  userMessage: string,
  recentTurns: RoutingChatTurn[] = [],
  preParsed?: RoutingContextSignals,
): Promise<IntentRoutingHints> {
  const signals = preParsed ?? (await parseRoutingContext({ userMessage, recentTurns }));
  return routingContextToIntentHints(signals);
}
