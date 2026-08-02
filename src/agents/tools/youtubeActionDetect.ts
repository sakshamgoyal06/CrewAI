/**
 * Detect messages that need YouTube tools (playlists, search-to-open, bookmark, cue).
 * Those belong to Magnus (GENERAL), not the prompt-only Happiness specialist.
 */
const ACTION_RE =
  /\b(?:youtube|yt\s*music|ytmusic|you\s*tube)\b|\b(?:bookmark|cue|queue|enqueue|up[\s-]?next)\b.{0,40}\b(?:song|video|track|clip|music)\b|\b(?:song|video|track|music)\b.{0,40}\b(?:bookmark|cue|queue|enqueue|up[\s-]?next)\b|\b(?:create|make|load|open|show|list)\b.{0,40}\bplaylist\b|\badd\b.{0,40}\bplaylist\b|\bplaylist\b.{0,40}\b(?:create|make|load|open|show|list|add|songs?|videos?)\b|\b(?:search|find|look\s+up|recommend|suggest)\b.{0,40}\b(?:on\s+)?(?:youtube|yt\s*music|ytmusic)\b|\b(?:youtube|yt\s*music|ytmusic)\b.{0,40}\b(?:search|find|recommend|suggest|play|watch)\b|\b(?:what(?:'s| is) (?:up )?next|play (?:the )?next)\b.{0,20}\b(?:song|video|track|cue|queue)?\b/i;

const URL_RE = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|playlist\?list=|shorts\/)|youtu\.be\/|music\.youtube\.com\/)/i;

export function looksLikeYoutubeAction(message: string): boolean {
  const text = message.trim();
  if (!text) {
    return false;
  }
  if (URL_RE.test(text)) {
    return true;
  }
  return ACTION_RE.test(text);
}
