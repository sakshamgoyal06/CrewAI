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
      id: "reminders",
      summary: "List, create, snooze, cancel task reminders (one-shot or recurring)",
      disambiguation:
        'remind me to…, what reminders do I have, snooze/cancel a reminder. NOT evening journal / rhythm nudges (use proactive).',
    },
    {
      id: "proactive",
      summary: "Manage proactive Telegram rhythm nudges (evening journal, drift guard, …)",
      disambiguation: "enable/disable evening journal, drift guard — not one-off task reminders.",
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
    {
      id: "project_setup",
      summary: "Start or continue planning a bounded project (outcome + deadline + checklist)",
      disambiguation:
        'User starting job search, trip, transformation, skill sprint, event — "plan Bali trip", "starting job search", "lose 10kg by June". active_project_session=true → continue setup.',
    },
    {
      id: "project_manage",
      summary: "Pause, resume, complete, abandon, or reprioritize an active project",
      disambiguation: "Pause trip planning, mark job search complete, make X primary project.",
    },
    {
      id: "project_status",
      summary: "Synthesis of active projects — progress, blockers, next checklist items",
      disambiguation: '"How\'s my job search?", "what\'s left on Bali?", project progress check.',
    },
    {
      id: "goal_manage",
      summary: "Add or list LifeOS goals (long-horizon SMART outcomes)",
      disambiguation: "Set a goal, add annual goal — not the same as starting a project.",
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
  reminders: ["manage_reminders", "log_event", "list_events", "update_event"],
  proactive: ["manage_proactive_messages"],
  journal_note: ["log_note"],
  zerodha_connect: ["connect_zerodha", "connect_kite"],
  conversation: [],
  project_setup: [],
  project_manage: ["list_items", "add_list_item", "update_list_item", "log_note"],
  project_status: ["list_items", "list_lifeos_goals"],
  goal_manage: ["add_goal", "list_lifeos_goals"],
};
