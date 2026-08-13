/**
 * Structural conversation signals for routing hints (not routing decisions).
 */
import type { RoutingChatTurn } from "./magnusToolContinuation.js";

export type ConversationSignals = {
  holistic_day_ask: boolean;
  saved_media_pick: boolean;
  schedule_accuracy_challenge: boolean;
  compound_action: boolean;
};

const HOLISTIC_DAY_RE =
  /\b(?:whole|entire|full)\s+day\b|\bday\s+look(?:s)?\b|\bwhat(?:'s|s| is| does)\s+(?:my\s+)?(?:today|tomorrow)\s+look\b|\bwhat\s+do\s+i\s+need\s+to\s+do\b|\bwhat(?:'s|s| is)\s+(?:for|on)\s+today\b|\bgym\s+(?:plan\s+)?and\s+meal\s+plan\b|\bmeal\s+plan\s+and\s+(?:gym|calendar|work)\b/i;

const MEAL_PLAN_ONLY_RE = /\bmeal\s+plan\b/i;

const SAVED_MEDIA_RE =
  /\b(?:from|on|in)\s+my\s+(?:wisdom|workout|watch|read|guitar|magnus|high\s+energy)\s+(?:youtube\s+)?playlist\b|\bsomething\s+from\s+my\s+(?:wisdom|watchlist|playlist)\b/i;

const ACTIVITY_MEDIA_RE =
  /\b(?:watch|cue|queue|podcast|video)\b.{0,40}\b(?:treadmill|cardio|gym|workout)\b|\b(?:treadmill|cardio|gym|workout)\b.{0,40}\b(?:watch|cue|queue|video|podcast)\b/i;

const SCHEDULE_CHALLENGE_RE =
  /\b(?:not\s+looking\s+at|aren'?t\s+looking\s+at|didn'?t\s+(?:check|read)|you(?:'re| are)\s+not)\s+(?:the\s+)?calendar\b|\bcheck\s+(?:using\s+)?calendar\b|\bcalendar\s+connections?\b/i;

const COMPOUND_ACTION_RE =
  /\.\s+(?:and\s+)?(?:also|then)\b|\band\s+(?:also\s+)?(?:suggest|add|show|what|find|send)\b|\b(?:calendar|youtube|gym|meal\s+plan)\b.{0,60}\band\b.{0,60}\b(?:calendar|youtube|gym|meal\s+plan|watchlist|playlist)\b/i;

export function buildConversationSignals(
  userMessage: string,
  recentTurns: RoutingChatTurn[] = [],
): ConversationSignals {
  const t = userMessage.trim();
  const lower = t.toLowerCase();

  const planForTomorrow =
    /\bplan\s+for\s+tomorrow\b/i.test(t) || /\bwhat(?:'s|s)\s+the\s+plan\s+for\s+tomorrow\b/i.test(t);

  const holistic_day_ask =
    HOLISTIC_DAY_RE.test(t) ||
    (planForTomorrow && !MEAL_PLAN_ONLY_RE.test(t)) ||
    /\bwhats?\s+for\s+today\b/i.test(t) ||
    /\bwhat\s+should\s+i\s+do\s+today\b/i.test(t);

  const saved_media_pick =
    SAVED_MEDIA_RE.test(t) ||
    (ACTIVITY_MEDIA_RE.test(t) && !/\byoutube\b/i.test(lower) && !/\bsearch\b/i.test(lower));

  const schedule_accuracy_challenge =
    SCHEDULE_CHALLENGE_RE.test(t) ||
    recentTurns.some(
      (turn) => turn.role === "user" && SCHEDULE_CHALLENGE_RE.test(turn.content),
    );

  return {
    holistic_day_ask,
    saved_media_pick,
    schedule_accuracy_challenge,
    compound_action: COMPOUND_ACTION_RE.test(t),
  };
}
