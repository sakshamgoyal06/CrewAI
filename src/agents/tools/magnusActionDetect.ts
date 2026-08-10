/**
 * Detect messages that need Magnus tools (lists, LifeOS writers, Notion) rather than
 * prompt-only pillar specialists.
 */
import { looksLikeYoutubeAction } from "./youtubeActionDetect.js";

const LIST_SLUGS =
  "watchlist|readlist|travel|food|music|tasks|goals|patterns|experiences|checkins";

const LIST_ACTION_RE = new RegExp(
  [
    `\\b(?:list_catalog|list_items|recommend_list_items|add_list_item|update_list_item|create_list)\\b`,
    `\\b(?:${LIST_SLUGS})\\b`,
    `\\b(?:add|remove|update|mark|move)\\b.{0,40}\\b(?:${LIST_SLUGS}|my list|the list)\\b`,
    `\\b(?:what(?:'s| is) on|show|read|open)\\b.{0,30}\\b(?:my )?(?:${LIST_SLUGS})\\b`,
    `\\brecommend\\b.{0,80}\\b(?:from|on|in)\\b.{0,30}\\b(?:my )?(?:${LIST_SLUGS}|list)\\b`,
    `\\b(?:sync|connect|link|setup)\\b.{0,25}\\bnotion\\b`,
    `\\bnotion\\b.{0,25}\\b(?:sync|connect|link|setup)\\b`,
  ].join("|"),
  "i",
);

const LIFEOS_ACTION_RE =
  /\b(?:log_joy_tank|joy\s+tank|happiness\s+reserve|log\s+joy)\b|\b(?:pillar\s+status|update_pillar_status)\b|\b(?:on_track|at_risk|deviating)\b.{0,50}\b(?:pillar|health|wealth|wisdom|joy|happiness)\b|\b(?:health|wealth|wisdom|joy|happiness)\s+pillar\b.{0,50}\b(?:on_track|at_risk|deviating)\b|\b(?:add\s+(?:a\s+)?goal|list_lifeos_goals|lifeos\s+goals?)\b/i;

const EVENT_LOG_EXPLICIT_RE =
  /\b(?:log_event|list_events|reschedule_event|update_event)\b|\b(?:reschedule|move)\b.{0,40}\b(?:commitment|event)\b/i;

const CHECKIN_LOG_RE =
  /\b(?:log|write|save|record)\b.{0,60}\b(?:daily\s+)?check[\s-]?ins?\b|\b(?:daily\s+)?check[\s-]?ins?\b.{0,60}\b(?:log|write|save|record)\b|\b(?:log|write|save|record)\b.{0,60}\b(?:workout|gym session|training session|pull a|push a|legs)\b|\b(?:done with|finished)\b.{0,50}\b(?:workout|gym)\b.{0,60}\b(?:log|and log)\b|\blog_daily_checkin\b|\bget_daily_checkin\b/i;

const PROACTIVE_RE =
  /\b(?:manage_proactive|proactive messages?)\b|\b(?:turn off|disable|stop|enable)\b.{0,40}\b(?:evening|morning|midday|drift|proactive|nudge|reminder|inactivity|stale)\b|\b(?:remind me)\b.{0,80}\b(?:at|tomorrow|tonight|every|daily)\b|\b(?:evening journal|drift guard|stale list|chat inactivity|don't forget to log)\b/i;

const PROJECT_ACTION_RE =
  /\b(?:job search|job hunting|plan(?:ning)?\s+(?:a\s+)?trip|vacation|lose \d+\s*kg|transformation|skill sprint|birthday party|project status|how'?s my .+ project|lock it in|pause .+ project|complete .+ project)\b/i;

/** True when Magnus (GENERAL) must run tools — not Happiness/Wealth/Wisdom prompt-only paths. */
export function looksLikeMagnusToolAction(message: string): boolean {
  const text = message.trim();
  if (!text) {
    return false;
  }
  if (looksLikeYoutubeAction(text)) {
    return false;
  }
  return (
    LIST_ACTION_RE.test(text) ||
    LIFEOS_ACTION_RE.test(text) ||
    EVENT_LOG_EXPLICIT_RE.test(text) ||
    CHECKIN_LOG_RE.test(text) ||
    PROACTIVE_RE.test(text) ||
    PROJECT_ACTION_RE.test(text)
  );
}
