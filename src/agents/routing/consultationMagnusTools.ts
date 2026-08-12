/**
 * During pillar_consultation, Magnus only gets tools the user message actually needs.
 * Prevents stray youtube_playlist (etc.) when Health handles the turn.
 */
import { looksLikeMagnusToolAction } from "../tools/magnusActionDetect.js";
import { looksLikeYoutubeAction } from "../tools/youtubeActionDetect.js";
import { GENERAL_CAPABILITY_TOOLS } from "./pillarStrategy/catalogs/generalCatalog.js";

const CALENDAR_RE =
  /\b(?:calendar|schedule|meeting|appointment|what(?:'s| is) on|free\s+(?:at|on)|tomorrow(?:'s)?\s+(?:day|schedule))\b/i;

const EVENT_LOG_RE =
  /\b(?:log_event|list_events|reschedule_event|update_event|commitment|habit)\b/i;

const JOURNAL_NOTE_RE = /\b(?:log_note|daily\s+log|journal\s+note)\b/i;

function addTools(set: Set<string>, capability: string): void {
  for (const name of GENERAL_CAPABILITY_TOOLS[capability] ?? []) {
    set.add(name);
  }
}

/** Tool names Magnus may use on a pillar_consultation turn (empty = no tools). */
export function magnusAllowedToolsForConsultation(userMessage: string): string[] {
  const msg = userMessage.trim();
  if (!msg) {
    return [];
  }

  const allowed = new Set<string>();

  if (looksLikeYoutubeAction(msg)) {
    addTools(allowed, "youtube");
  }

  if (looksLikeMagnusToolAction(msg)) {
    for (const cap of [
      "lists",
      "lifeos",
      "event_log",
      "proactive",
      "notion",
      "journal_note",
      "project_manage",
      "project_status",
      "goal_manage",
    ]) {
      addTools(allowed, cap);
    }
  }

  if (CALENDAR_RE.test(msg)) {
    addTools(allowed, "calendar");
  }

  if (EVENT_LOG_RE.test(msg)) {
    addTools(allowed, "event_log");
  }

  if (JOURNAL_NOTE_RE.test(msg)) {
    addTools(allowed, "journal_note");
  }

  if (/\b(?:connect|link)\b.{0,20}\b(?:notion)\b/i.test(msg)) {
    addTools(allowed, "notion");
  }

  if (/\b(?:zerodha|kite)\b/i.test(msg) && /\bconnect\b/i.test(msg)) {
    addTools(allowed, "zerodha_connect");
  }

  return [...allowed];
}
