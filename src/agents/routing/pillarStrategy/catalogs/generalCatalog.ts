import type { CapabilityCatalog } from "../types.js";

export const GENERAL_CAPABILITY_CATALOG: CapabilityCatalog = {
  pillar: "GENERAL",
  capabilities: [
    {
      id: "pillar_consultation",
      summary: "Magnus tools plus one or more pillar specialists in the same turn",
      disambiguation:
        "Message needs BOTH Magnus actions (calendar, lists, check-in, event log) AND pillar depth (workout review, portfolio, taste, career). Args: pillars array e.g. [\"HEALTH\"]. Prefer over guessing a single pillar intent.",
    },
    {
      id: "day_overview",
      summary: "Holistic day snapshot: Google Calendar + event log commitments + planned meals",
      disambiguation:
        'User wants the **whole day** or schedule — "what does my day/tomorrow look like", "entire day", "what\'s on tomorrow", calendar AND meals AND commitments together. Prefer over calendar alone when they ask about the full day, not food-only.',
    },
    {
      id: "calendar",
      summary: "Read or write Google Calendar (schedule, events, availability)",
      disambiguation: "What's on my calendar, schedule meeting, move event.",
    },
    {
      id: "event_log",
      summary: "Log/list/reschedule/update commitments in Magnus event log",
      disambiguation: "log_event, list_events, reschedule habits/commitments.",
    },
    {
      id: "youtube",
      summary: "YouTube/YT Music search, playlists, bookmarks, cue queue",
      disambiguation: "Play/search/add to playlist — NOT taste talk without action.",
    },
    {
      id: "lists",
      summary: "User lists: watchlist, readlist, tasks, food, goals, recommend from list",
      disambiguation: "add to watchlist, show my tasks, recommend from food list.",
    },
    {
      id: "lifeos",
      summary: "Joy tank, pillar status, LifeOS goals, daily check-in",
      disambiguation: "log joy tank, pillar status, daily check-in.",
    },
    {
      id: "notion",
      summary: "Connect/sync/setup Notion integration",
      disambiguation: "connect Notion, sync lists.",
    },
    {
      id: "proactive",
      summary: "Manage proactive Telegram reminders and nudges",
      disambiguation: "enable/disable reminders, create custom reminder.",
    },
    {
      id: "journal_note",
      summary: "Log a note to daily log (Magnus log_note)",
      disambiguation: "Quick note/journal entry to daily log — not health EOD journal.",
    },
    {
      id: "zerodha_connect",
      summary: "Connect Zerodha from GENERAL path (same as wealth kite_connect)",
      disambiguation: "connect Zerodha when not already in WEALTH intent.",
    },
    {
      id: "conversation",
      summary: "Ordinary chat, cross-pillar Q&A, lookups without tools",
      disambiguation: "Default when no tool action needed.",
    },
  ],
};

export const GENERAL_CAPABILITY_IDS = GENERAL_CAPABILITY_CATALOG.capabilities.map((c) => c.id);

/** Magnus tool names allowed per GENERAL capability (executor filters tools). */
export const GENERAL_CAPABILITY_TOOLS: Record<string, string[]> = {
  pillar_consultation: [],
  day_overview: [],
  calendar: [
    "read_calendar",
    "create_calendar_event",
    "update_calendar_event",
    "delete_calendar_event",
    "connect_google",
    "connect_calendar",
  ],
  event_log: ["log_event", "update_event", "reschedule_event", "list_events"],
  youtube: [
    "youtube_search",
    "youtube_recommend",
    "youtube_playlist",
    "youtube_bookmark",
    "youtube_cue",
    "connect_google",
    "connect_youtube",
  ],
  lists: [
    "list_catalog",
    "list_items",
    "list_notion_items",
    "add_list_item",
    "add_notion_item",
    "update_list_item",
    "update_notion_item",
    "create_list",
    "link_notion_list",
    "recommend_list_items",
    "add_goal",
    "add_notion_goal",
  ],
  lifeos: [
    "update_pillar_status",
    "log_joy_tank",
    "list_lifeos_goals",
    "get_daily_checkin",
    "log_daily_checkin",
  ],
  notion: ["connect_notion", "sync_notion", "setup_notion"],
  proactive: ["manage_proactive_messages"],
  journal_note: ["log_note"],
  zerodha_connect: ["connect_zerodha", "connect_kite"],
  conversation: [],
};
