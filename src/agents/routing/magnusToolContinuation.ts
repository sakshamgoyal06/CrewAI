/**
 * Detect short follow-ups that need Magnus tools (YouTube playlists, etc.) even when the
 * classifier routes to a prompt-only pillar specialist.
 */
import { looksLikeYoutubeAction } from "../tools/youtubeActionDetect.js";

export type RoutingChatTurn = {
  role: string;
  content: string;
  metadata?: Record<string, unknown> | null;
};

const AFFIRMATIVE_RE =
  /^(yes|yeah|yep|yup|sure|ok|okay|go ahead|do it|please|that one|sounds good|continue)\.?$/i;

const PLAYLIST_OPS_RE =
  /\b(?:empty|clear|dedupe|dedup|duplicates?|recreate|rebuild|reorder|remove)\b.{0,40}\b(?:playlist|wisdom|wealth|magnus|happiness|health)\b|\b(?:wisdom|wealth|magnus|happiness|health|joy)\s+playlist\b|\bplaylist\b.{0,30}\b(?:wisdom|wealth|magnus|happiness)\b/i;

const ADD_TOPIC_RE =
  /\b(?:add|search|find)\b.{0,60}\b(?:rag|vector|embedding|neural|transformer|llm)\b/i;

function lastAssistantTurn(turns: RoutingChatTurn[]): RoutingChatTurn | undefined {
  for (let i = turns.length - 1; i >= 0; i -= 1) {
    if (turns[i]?.role === "assistant") {
      return turns[i];
    }
  }
  return undefined;
}

function assistantUsedYoutubeTools(meta: Record<string, unknown> | null | undefined): boolean {
  const tools = meta?.tools_used;
  if (!Array.isArray(tools)) {
    return false;
  }
  return tools.some((t) => String(t).startsWith("youtube_"));
}

function assistantOfferedYoutubeAction(content: string): boolean {
  const lower = content.toLowerCase();
  return (
    /\b(?:want me to|shall i|should i)\b/.test(lower) &&
    /\b(?:playlist|youtube|cue|bookmark|add|remove|dedupe|clear|save)\b/.test(lower)
  );
}

/**
 * True when this message should run through Magnus (GENERAL) for tool access.
 */
export function looksLikeMagnusToolContinuation(
  message: string,
  recentTurns: RoutingChatTurn[] = [],
): boolean {
  const text = message.trim();
  if (!text) {
    return false;
  }

  if (looksLikeYoutubeAction(text)) {
    return false;
  }

  if (PLAYLIST_OPS_RE.test(text) || ADD_TOPIC_RE.test(text)) {
    return true;
  }

  if (!AFFIRMATIVE_RE.test(text)) {
    return false;
  }

  const last = lastAssistantTurn(recentTurns);
  if (!last) {
    return false;
  }

  if (assistantUsedYoutubeTools(last.metadata ?? null)) {
    return true;
  }

  return assistantOfferedYoutubeAction(last.content);
}
