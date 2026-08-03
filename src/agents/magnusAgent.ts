/**
 * Magnus himself — the coordinator, and the only voice the user hears.
 *
 * Pillar specialists handle depth (health, wealth, happiness, wisdom). Magnus keeps everything
 * that spans them or belongs to no one: the day, the calendar, journaling and logging, reminders,
 * YouTube / YT Music, and ordinary conversation.
 *
 * This is the only agent with tools, because these are Magnus's own responsibilities rather than
 * any pillar's: reading and writing Google Calendar, logging notes, the event log, and YouTube.
 */
import type {
  Message,
  MessageParam,
  Tool,
  ToolUseBlock,
} from "@anthropic-ai/sdk/resources/messages/messages.js";

import { logger } from "../logger.js";
import { loggableError } from "../util/loggableError.js";
import { anthropic } from "../tools/clients.js";
import { buildAgentMessages } from "./memory/memoryAgent.js";
import {
  createCalendarEvent,
  deleteCalendarEvent,
  readCalendarEvents,
  updateCalendarEvent,
} from "./tools/calendarTool.js";
import {
  listEventsTool,
  logEvent,
  rescheduleEventTool,
  updateEventStatus,
} from "./tools/eventLogTool.js";
import { logNote } from "./tools/logNoteTool.js";
import {
  youtubeBookmarkTool,
  youtubeCueTool,
  youtubePlaylistTool,
  youtubeRecommendTool,
  youtubeSearchTool,
} from "./tools/youtubeTool.js";
import { connectGoogleTool } from "./tools/youtubeConnectTool.js";
import {
  addNotionGoal,
  getNotionCheckin,
  notionAddItem,
  notionListItems,
  notionUpdateItem,
} from "./tools/notionListTool.js";
import type { AgentContext, AgentResult } from "./types.js";
import { buildMagnusSystem, MAGNUS_CORE_SYSTEM } from "./magnusCorePrompt.js";

const MODEL = "claude-sonnet-4-6";
// Calendar + event log + YouTube in one turn needs a little headroom.
const MAX_TOOL_ROUNDS = 8;

/** @deprecated Use buildMagnusSystem(ctx) — core prompt is user-agnostic. */
export const MAGNUS_SYSTEM = MAGNUS_CORE_SYSTEM;

const TOOLS: Tool[] = [
  {
    name: "read_calendar",
    description:
      "Read Google Calendar events in a time range, including descriptions and attachment links when present. Use for schedule, availability, day/week summaries, and reading event agendas.",
    input_schema: {
      type: "object",
      properties: {
        start_iso: {
          type: "string",
          description: "Range start, ISO 8601. Defaults to now.",
        },
        end_iso: {
          type: "string",
          description: "Range end, ISO 8601. Defaults to 7 days after start.",
        },
        query: {
          type: "string",
          description: "Free-text filter, for finding a named event to change or cancel.",
        },
      },
      required: [],
    },
  },
  {
    name: "create_calendar_event",
    description: "Create an event on the primary Google Calendar.",
    input_schema: {
      type: "object",
      properties: {
        summary: { type: "string", description: "Event title." },
        start_iso: {
          type: "string",
          description:
            "Start as ISO 8601 local time without offset (2026-07-28T18:00:00), or YYYY-MM-DD for an all-day event.",
        },
        end_iso: {
          type: "string",
          description: "End, same format as start_iso.",
        },
        description: { type: "string" },
        location: { type: "string" },
      },
      required: ["summary", "start_iso", "end_iso"],
    },
  },
  {
    name: "update_calendar_event",
    description:
      "Change an existing event: move it, rename it, change location or description. Requires the id from read_calendar. Send only the fields that change.",
    input_schema: {
      type: "object",
      properties: {
        event_id: { type: "string", description: "From read_calendar." },
        summary: { type: "string", description: "New title." },
        start_iso: {
          type: "string",
          description:
            "New start, ISO 8601 local time without offset (2026-07-28T18:00:00). Omit end_iso to keep the same duration.",
        },
        end_iso: { type: "string", description: "New end, same format." },
        description: { type: "string" },
        location: { type: "string" },
      },
      required: ["event_id"],
    },
  },
  {
    name: "delete_calendar_event",
    description:
      "Cancel and remove an event. Requires the id from read_calendar. Use only when the user asks to cancel or delete.",
    input_schema: {
      type: "object",
      properties: {
        event_id: { type: "string", description: "From read_calendar." },
      },
      required: ["event_id"],
    },
  },
  {
    name: "log_note",
    description:
      "Save a note to the daily log (Supabase, plus Notion when configured). Use for journal entries, decisions, and things worth remembering.",
    input_schema: {
      type: "object",
      properties: {
        text: { type: "string", description: "The note, in the user's own framing." },
        date: {
          type: "string",
          description: "Calendar day YYYY-MM-DD. Defaults to today in the user's timezone.",
        },
        event_id: {
          type: "string",
          description: "From list_events, when the note is about a logged commitment.",
        },
      },
      required: ["text"],
    },
  },
  {
    name: "log_event",
    description:
      "Record a commitment in the event log: something planned, or something already done. Use whenever he locks in an activity or reports finishing one.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short name, e.g. 'AI session'." },
        start: {
          type: "string",
          description:
            "Planned start as local time without offset (2026-07-31T21:00), or YYYY-MM-DD for a whole day. Omit if there is no time yet.",
        },
        end: { type: "string", description: "Planned end, same format as start." },
        duration_minutes: {
          type: "number",
          description: "Used instead of end when he gives a length rather than a finish time.",
        },
        pillar: {
          type: "string",
          enum: ["health", "wealth", "wisdom", "joy", "magnus"],
          description: "Which part of his life this belongs to. 'magnus' for admin and errands.",
        },
        activity: {
          type: "string",
          description:
            "Stable name for the recurring thing, e.g. 'ai session', 'gym', 'reading'. Reuse the same wording every time.",
        },
        details: { type: "string", description: "What it involves, in his framing." },
        status: {
          type: "string",
          enum: ["planned", "in_progress", "done", "partial", "skipped", "missed", "cancelled"],
          description: "Defaults to planned. Use done when he is reporting it after the fact.",
        },
        actual_start: { type: "string", description: "When it really started, if known." },
        actual_end: { type: "string", description: "When it really finished, if known." },
        note: { type: "string", description: "How it went." },
        reason: { type: "string", description: "Why it was skipped or missed." },
        priority: { type: "number", description: "1 highest to 5 lowest." },
        calendar_event_id: {
          type: "string",
          description: "Id from create_calendar_event, when this is also on the calendar.",
        },
        remind_at: { type: "string", description: "When to nudge him, local time." },
      },
      required: ["title"],
    },
  },
  {
    name: "update_event",
    description:
      "Say what became of a logged commitment: done, partial, skipped, missed, in progress or cancelled. Needs the id from list_events. Not for moving something to another time.",
    input_schema: {
      type: "object",
      properties: {
        event_id: { type: "string", description: "From list_events." },
        status: {
          type: "string",
          enum: ["planned", "in_progress", "done", "partial", "skipped", "missed", "cancelled"],
        },
        note: { type: "string", description: "How it went, in his words." },
        reason: { type: "string", description: "Why it did not happen, when it did not." },
        actual_start: { type: "string", description: "When it really started, local time." },
        actual_end: { type: "string", description: "When it really finished, local time." },
        details: { type: "string", description: "Corrected or fuller description." },
      },
      required: ["event_id"],
    },
  },
  {
    name: "reschedule_event",
    description:
      "Move a logged commitment to a new time. Closes the original as postponed or preponed and opens a linked replacement, so the slip is kept. Needs the id from list_events.",
    input_schema: {
      type: "object",
      properties: {
        event_id: { type: "string", description: "From list_events." },
        new_start: {
          type: "string",
          description:
            "New start, local time without offset. Omit when he is pushing it with no new time in mind.",
        },
        new_end: {
          type: "string",
          description: "New end. Omit to keep the original length.",
        },
        kind: {
          type: "string",
          enum: ["postponed", "preponed", "rescheduled"],
          description: "Leave empty to infer from the times.",
        },
        reason: { type: "string", description: "Why it moved — the useful part." },
      },
      required: ["event_id"],
    },
  },
  {
    name: "list_events",
    description:
      "Read the event log: what is planned, what happened, what slipped, and how a recurring activity actually goes. Read before answering anything about his commitments or habits.",
    input_schema: {
      type: "object",
      properties: {
        from: {
          type: "string",
          description: "Range start, YYYY-MM-DD or local datetime. Defaults to yesterday.",
        },
        to: {
          type: "string",
          description: "Range end, YYYY-MM-DD or local datetime. Defaults to a week out.",
        },
        status: {
          type: "string",
          description:
            "Filter: 'open', 'closed', 'slipped', 'all', or specific statuses comma-separated.",
        },
        pillar: { type: "string", enum: ["health", "wealth", "wisdom", "joy", "magnus"] },
        activity: {
          type: "string",
          description: "Narrow to one recurring activity, e.g. 'gym'.",
        },
        query: { type: "string", description: "Free-text match on the title." },
        event_id: {
          type: "string",
          description: "One event and its full move history, instead of a range.",
        },
        include_stats: {
          type: "boolean",
          description: "Add completion rate, typical time of day and usual delay.",
        },
        include_unscheduled: {
          type: "boolean",
          description: "Also return commitments with no time on them yet.",
        },
        limit: { type: "number", description: "Max rows, default 30." },
      },
      required: [],
    },
  },
  {
    name: "youtube_search",
    description:
      "Search YouTube / YT Music for songs or videos. Returns titles, channels, durations, and openable links.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "What to search for." },
        kind: {
          type: "string",
          enum: ["song", "video", "all"],
          description: "Prefer song for music. Defaults to all.",
        },
        max_results: { type: "number", description: "How many results, default 8." },
      },
      required: ["query"],
    },
  },
  {
    name: "youtube_recommend",
    description:
      "Recommend songs or videos with real links. Seed with a video_id, pass a mood/query, or omit both for trending.",
    input_schema: {
      type: "object",
      properties: {
        seed_video_id: {
          type: "string",
          description: "Video id to recommend similar items from.",
        },
        query: { type: "string", description: "Mood, artist, genre, or topic." },
        kind: { type: "string", enum: ["song", "video", "all"] },
        max_results: { type: "number" },
      },
      required: [],
    },
  },
  {
    name: "youtube_playlist",
    description:
      "Manage YouTube playlists: list, load, create, add, remove, ensure_magnus (default Magnus playlist).",
    input_schema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["list", "load", "create", "add", "remove", "ensure_magnus"],
        },
        playlist_id: {
          type: "string",
          description: "Playlist id, or 'magnus' for the default Magnus playlist.",
        },
        title: { type: "string", description: "For create." },
        description: { type: "string", description: "For create." },
        privacy_status: {
          type: "string",
          enum: ["private", "unlisted", "public"],
          description: "For create. Defaults to private.",
        },
        video_id: { type: "string", description: "For add." },
        url: { type: "string", description: "For add — YouTube URL instead of video_id." },
        query: { type: "string", description: "For add — search and take the top hit." },
        playlist_item_id: {
          type: "string",
          description: "For remove — from a prior load.",
        },
        max_results: { type: "number" },
      },
      required: ["action"],
    },
  },
  {
    name: "youtube_bookmark",
    description:
      "Magnus shortlist of songs/videos (also likes on YouTube when connected). Actions: add, list, remove, liked.",
    input_schema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["add", "list", "remove", "liked"] },
        video_id: { type: "string" },
        url: { type: "string" },
        query: { type: "string", description: "Search and bookmark the top hit." },
        kind: { type: "string", enum: ["song", "video", "all"] },
        note: { type: "string", description: "Why he wants this saved." },
        bookmark_id: { type: "string", description: "For remove." },
        also_like: {
          type: "boolean",
          description: "Also like on YouTube when adding. Defaults to true.",
        },
        max_results: { type: "number" },
      },
      required: ["action"],
    },
  },
  {
    name: "youtube_cue",
    description:
      "Up-next cue queue for songs/videos. Actions: add, list, next, skip, remove, clear.",
    input_schema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["add", "list", "next", "skip", "remove", "clear"],
        },
        video_id: { type: "string" },
        url: { type: "string" },
        query: { type: "string", description: "Search and cue the top hit." },
        kind: { type: "string", enum: ["song", "video", "all"] },
        note: { type: "string" },
        cue_id: { type: "string", description: "For remove." },
        max_results: { type: "number" },
      },
      required: ["action"],
    },
  },
  {
    name: "list_notion_items",
    description:
      "Read a LifeOS list in Notion: watchlist, readlist, travel, food, music, tasks, goals, or patterns. Use open_only for queued items to recommend from.",
    input_schema: {
      type: "object",
      properties: {
        list: {
          type: "string",
          description: "watchlist | readlist | travel | food | music | tasks | goals | patterns",
        },
        status: { type: "string", description: "Optional exact status filter." },
        open_only: { type: "boolean", description: "Only queued / in-progress items." },
        limit: { type: "number", description: "Max rows, default 15." },
      },
      required: ["list"],
    },
  },
  {
    name: "add_notion_item",
    description: "Add a row to a LifeOS Notion list.",
    input_schema: {
      type: "object",
      properties: {
        list: { type: "string" },
        title: { type: "string" },
        status: { type: "string" },
        notes: { type: "string" },
        url: { type: "string" },
        author: { type: "string", description: "Book author or music artist." },
        priority: { type: "string", enum: ["High", "Medium", "Low"] },
      },
      required: ["list", "title"],
    },
  },
  {
    name: "update_notion_item",
    description:
      "Update a Notion list row by page id (from list_notion_items): status, notes, or title.",
    input_schema: {
      type: "object",
      properties: {
        list: { type: "string" },
        page_id: { type: "string" },
        status: { type: "string" },
        notes: { type: "string" },
        title: { type: "string" },
      },
      required: ["list", "page_id"],
    },
  },
  {
    name: "get_daily_checkin",
    description: "Read the Daily Check-ins row for a date (pillar scores and reflection).",
    input_schema: {
      type: "object",
      properties: {
        date: { type: "string", description: "YYYY-MM-DD. Defaults to today." },
      },
      required: [],
    },
  },
  {
    name: "add_notion_goal",
    description: "Create a row in Goals & Milestones (Notion).",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        pillar: {
          type: "string",
          enum: ["health", "wealth", "wisdom", "joy", "happiness"],
        },
        status: { type: "string" },
      },
      required: ["title"],
    },
  },
  {
    name: "connect_google",
    description:
      "Start unified Google onboarding (Calendar + YouTube / YT Music) for this user: returns a one-time consent link. Use when they ask to connect Google, Calendar, or YouTube, or when a calendar/YouTube tool says it is not connected.",
    input_schema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "connect_youtube",
    description:
      "Alias for connect_google — same one-time Google consent link covering YouTube and Calendar.",
    input_schema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "connect_calendar",
    description:
      "Alias for connect_google — same one-time Google consent link covering Calendar and YouTube.",
    input_schema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
];

function textFromMessage(msg: Message): string {
  const parts: string[] = [];
  for (const block of msg.content) {
    if (block.type === "text") {
      parts.push(block.text);
    }
  }
  return parts.join("\n").trim();
}

function toolUses(msg: Message): ToolUseBlock[] {
  return msg.content.filter((b): b is ToolUseBlock => b.type === "tool_use");
}

function contextBlock(ctx: AgentContext): string {
  const tz = ctx.timezone?.trim() || "UTC";
  const now = new Date();
  const local = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    dateStyle: "full",
    timeStyle: "short",
  }).format(now);

  const parts = [`Current time: ${local} (${tz})`, `Current time UTC: ${now.toISOString()}`];
  if (ctx.northStarGoal?.trim()) {
    parts.push(`North star: ${ctx.northStarGoal.trim()}`);
  }
  return parts.join("\n");
}

const str = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value : undefined;

const num = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

async function runTool(
  name: string,
  input: Record<string, unknown>,
  ctx: AgentContext,
): Promise<string> {
  const timeZone = ctx.timezone?.trim() || "UTC";
  try {
    switch (name) {
      case "read_calendar":
        return await readCalendarEvents({
          startIso: typeof input.start_iso === "string" ? input.start_iso : undefined,
          endIso: typeof input.end_iso === "string" ? input.end_iso : undefined,
          query: typeof input.query === "string" ? input.query : undefined,
          timeZone,
          userProfileId: ctx.userProfileId,
        });
      case "create_calendar_event":
        return await createCalendarEvent({
          summary: String(input.summary ?? ""),
          startIso: String(input.start_iso ?? ""),
          endIso: String(input.end_iso ?? ""),
          description:
            typeof input.description === "string" ? input.description : undefined,
          location: typeof input.location === "string" ? input.location : undefined,
          timeZone,
          userProfileId: ctx.userProfileId,
        });
      case "update_calendar_event":
        return await updateCalendarEvent({
          eventId: String(input.event_id ?? ""),
          summary: typeof input.summary === "string" ? input.summary : undefined,
          startIso: typeof input.start_iso === "string" ? input.start_iso : undefined,
          endIso: typeof input.end_iso === "string" ? input.end_iso : undefined,
          description:
            typeof input.description === "string" ? input.description : undefined,
          location: typeof input.location === "string" ? input.location : undefined,
          timeZone,
          userProfileId: ctx.userProfileId,
        });
      case "delete_calendar_event":
        return await deleteCalendarEvent({
          eventId: String(input.event_id ?? ""),
          timeZone,
          userProfileId: ctx.userProfileId,
        });
      case "log_note":
        return await logNote({
          userProfileId: ctx.userProfileId,
          text: String(input.text ?? ""),
          date: typeof input.date === "string" ? input.date : undefined,
          eventId: typeof input.event_id === "string" ? input.event_id : undefined,
          timeZone,
        });
      case "log_event":
        return await logEvent({
          userProfileId: ctx.userProfileId,
          timeZone,
          title: String(input.title ?? ""),
          start: str(input.start),
          end: str(input.end),
          durationMinutes: num(input.duration_minutes),
          pillar: str(input.pillar),
          activity: str(input.activity),
          details: str(input.details),
          status: str(input.status),
          actualStart: str(input.actual_start),
          actualEnd: str(input.actual_end),
          note: str(input.note),
          reason: str(input.reason),
          priority: num(input.priority),
          calendarEventId: str(input.calendar_event_id),
          remindAt: str(input.remind_at),
        });
      case "update_event":
        return await updateEventStatus({
          userProfileId: ctx.userProfileId,
          timeZone,
          eventId: String(input.event_id ?? ""),
          status: str(input.status),
          note: str(input.note),
          reason: str(input.reason),
          actualStart: str(input.actual_start),
          actualEnd: str(input.actual_end),
          details: str(input.details),
        });
      case "reschedule_event":
        return await rescheduleEventTool({
          userProfileId: ctx.userProfileId,
          timeZone,
          eventId: String(input.event_id ?? ""),
          newStart: str(input.new_start),
          newEnd: str(input.new_end),
          kind: str(input.kind),
          reason: str(input.reason),
        });
      case "list_events":
        return await listEventsTool({
          userProfileId: ctx.userProfileId,
          timeZone,
          from: str(input.from),
          to: str(input.to),
          status: str(input.status),
          pillar: str(input.pillar),
          activity: str(input.activity),
          query: str(input.query),
          eventId: str(input.event_id),
          includeStats: input.include_stats === true,
          includeUnscheduled: input.include_unscheduled === true,
          limit: num(input.limit),
        });
      case "youtube_search":
        return await youtubeSearchTool({
          query: String(input.query ?? ""),
          kind: str(input.kind),
          maxResults: num(input.max_results),
          userProfileId: ctx.userProfileId,
        });
      case "youtube_recommend":
        return await youtubeRecommendTool({
          seedVideoId: str(input.seed_video_id),
          query: str(input.query),
          kind: str(input.kind),
          maxResults: num(input.max_results),
          userProfileId: ctx.userProfileId,
        });
      case "youtube_playlist":
        return await youtubePlaylistTool({
          action: String(input.action ?? ""),
          userProfileId: ctx.userProfileId,
          playlistId: str(input.playlist_id),
          title: str(input.title),
          description: str(input.description),
          videoId: str(input.video_id),
          url: str(input.url),
          query: str(input.query),
          playlistItemId: str(input.playlist_item_id),
          privacyStatus: str(input.privacy_status),
          maxResults: num(input.max_results),
        });
      case "youtube_bookmark":
        return await youtubeBookmarkTool({
          action: String(input.action ?? ""),
          userProfileId: ctx.userProfileId,
          videoId: str(input.video_id),
          url: str(input.url),
          query: str(input.query),
          kind: str(input.kind),
          note: str(input.note),
          bookmarkId: str(input.bookmark_id),
          alsoLike: input.also_like === false ? false : undefined,
          maxResults: num(input.max_results),
        });
      case "youtube_cue":
        return await youtubeCueTool({
          action: String(input.action ?? ""),
          userProfileId: ctx.userProfileId,
          videoId: str(input.video_id),
          url: str(input.url),
          query: str(input.query),
          kind: str(input.kind),
          note: str(input.note),
          cueId: str(input.cue_id),
          maxResults: num(input.max_results),
        });
      case "list_notion_items":
        return await notionListItems({
          userProfileId: ctx.userProfileId,
          list: String(input.list ?? ""),
          status: str(input.status),
          openOnly: input.open_only === true,
          limit: num(input.limit),
        });
      case "add_notion_item":
        return await notionAddItem({
          userProfileId: ctx.userProfileId,
          list: String(input.list ?? ""),
          title: String(input.title ?? ""),
          status: str(input.status),
          notes: str(input.notes),
          url: str(input.url),
          author: str(input.author),
          priority: str(input.priority),
        });
      case "update_notion_item":
        return await notionUpdateItem({
          userProfileId: ctx.userProfileId,
          list: String(input.list ?? ""),
          pageId: String(input.page_id ?? ""),
          status: str(input.status),
          notes: str(input.notes),
          title: str(input.title),
        });
      case "get_daily_checkin":
        return await getNotionCheckin({
          userProfileId: ctx.userProfileId,
          date: str(input.date),
        });
      case "add_notion_goal":
        return await addNotionGoal({
          userProfileId: ctx.userProfileId,
          title: String(input.title ?? ""),
          pillar: str(input.pillar),
          status: str(input.status),
        });
      case "connect_google":
      case "connect_calendar":
      case "connect_youtube":
        return await connectGoogleTool({
          userProfileId: ctx.userProfileId,
          telegramUserId: ctx.telegramUserId,
        });
      default:
        return `Unknown tool: ${name}`;
    }
  } catch (e) {
    logger.warn({ err: loggableError(e), tool: name }, "magnus tool failed");
    return `Tool error: ${e instanceof Error ? e.message : String(e)}`;
  }
}

export async function runMagnusAgent(ctx: AgentContext): Promise<AgentResult> {
  const messages: MessageParam[] = buildAgentMessages(
    ctx,
    `${ctx.rawMessage}\n\n---\n${contextBlock(ctx)}`,
  );

  const toolsUsed: string[] = [];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: buildMagnusSystem({ displayName: ctx.displayName }),
      tools: TOOLS,
      messages,
    });

    const uses = toolUses(msg);
    if (uses.length === 0) {
      return {
        text: textFromMessage(msg) || "…",
        metadata: {
          specialist: "Magnus",
          pillar: "magnus",
          ...(toolsUsed.length > 0 ? { tools_used: toolsUsed } : {}),
        },
      };
    }

    messages.push({ role: "assistant", content: msg.content });
    const results = [];
    for (const use of uses) {
      toolsUsed.push(use.name);
      const out = await runTool(
        use.name,
        (use.input ?? {}) as Record<string, unknown>,
        ctx,
      );
      results.push({
        type: "tool_result" as const,
        tool_use_id: use.id,
        content: out,
      });
    }
    messages.push({ role: "user", content: results });
  }

  logger.warn({ toolsUsed }, "magnus agent hit the tool round limit");
  return {
    text: "I got stuck working through that one. Try asking for one thing at a time.",
    metadata: { specialist: "Magnus", pillar: "magnus", tool_limit: true },
  };
}
