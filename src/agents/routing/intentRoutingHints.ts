/**
 * Structural intent hints for the top-level classifier — signals only, not routing decisions.
 * Replaces post-classifier regex coercions; the classifier reads these hints with the message.
 */
import { isMealDayBreakdownRequest, matchesMealHistoryMessage } from "../health/mealHistoryAgent.js";
import { parseMealLogCommand } from "../../meals/parseMealLogCommand.js";
import { looksLikeMagnusToolContinuation, type RoutingChatTurn } from "./magnusToolContinuation.js";
import {
  looksLikeHealthFitnessIntent,
  looksLikeWealthPortfolioIntent,
} from "./pillarConsultationSignals.js";
import { looksLikeMagnusToolAction } from "../tools/magnusActionDetect.js";
import { looksLikeYoutubeAction } from "../tools/youtubeActionDetect.js";
import { buildConversationSignals } from "./conversationSignals.js";

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

export function buildIntentRoutingHints(
  userMessage: string,
  recentTurns: RoutingChatTurn[] = [],
): IntentRoutingHints {
  const conversation = buildConversationSignals(userMessage, recentTurns);
  return {
    explicit_meal_log: parseMealLogCommand(userMessage).kind === "meal",
    looks_like_meal_log_read:
      isMealDayBreakdownRequest(userMessage) ||
      (matchesMealHistoryMessage(userMessage) && !/\bmeal\s+plan\b/i.test(userMessage)),
    looks_like_youtube_action: looksLikeYoutubeAction(userMessage),
    looks_like_magnus_tool_action: looksLikeMagnusToolAction(userMessage),
    looks_like_magnus_tool_continuation: looksLikeMagnusToolContinuation(userMessage, recentTurns),
    looks_like_health_fitness_read: looksLikeHealthFitnessIntent(userMessage),
    looks_like_wealth_portfolio_read: looksLikeWealthPortfolioIntent(userMessage),
    holistic_day_ask: conversation.holistic_day_ask,
    saved_media_pick: conversation.saved_media_pick,
    schedule_accuracy_challenge: conversation.schedule_accuracy_challenge,
    compound_action: conversation.compound_action,
  };
}
