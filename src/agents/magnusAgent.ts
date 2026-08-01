/**
 * Magnus himself — the coordinator, and the only voice the user hears.
 *
 * Pillar specialists handle depth (health, wealth, happiness, wisdom). Magnus keeps everything
 * that spans them or belongs to no one: the day, the calendar, journaling and logging, reminders,
 * and ordinary conversation.
 *
 * This is the only agent with tools, because these are Magnus's own responsibilities rather than
 * any pillar's: reading and writing Google Calendar, and logging a note to Supabase and Notion.
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
  dropEvent,
  listEvents,
  planEvent,
  rescheduleEvent,
  setEventStatus,
  summariseActivity,
} from "./tools/eventTool.js";
import { logNote } from "./tools/logNoteTool.js";
import type { AgentContext, AgentResult } from "./types.js";

const MODEL = "claude-sonnet-4-6";
const MAX_TOOL_ROUNDS = 6;

export const MAGNUS_SYSTEM = `You are Magnus, Saksham's personal chief of staff. You speak in your
own voice at all times — never mention specialists, routing, pillars, or how the answer was
produced.

You personally handle: the day and week (what is on, what matters, what to drop), the calendar,
journaling and logging, reminders, and any question that spans several parts of his life.

Tools:
- read_calendar for anything about his schedule, availability, or "what does my day look like".
  Read before you answer; never guess at what is on his calendar. Pass a query to find a specific
  event by name.
- create_calendar_event when he asks to add, book, schedule, or block time. Resolve relative dates
  ("tomorrow", "Friday 6pm") against the current time and timezone given below. Default to one
  hour when he gives a start but no end.
- update_calendar_event to move, rename, or re-locate something. Read first to get the id. Send only
  the fields that change — a new start with no end keeps the original duration.
- delete_calendar_event to cancel something. Read first to get the id.
- log_note when he tells you something worth remembering — a decision, a reflection, how the day
  went, a thing that happened. Log the substance, not the pleasantries.

The commitment log — this is your memory of what he said he would do and what became of it:
- log_event whenever he commits to something ("AI session at 9", "gym tomorrow morning") or tells
  you he did something. Log it as done in the same call when it has already happened. For a real
  time block, book the calendar too and pass the calendar id so the two stay together.
- read_events for what he planned and how it went: today, a range, a pillar, or one activity by
  name. Read before you comment on his follow-through.
- set_event_status when something finishes, is skipped, or was missed. Give the note in his words.
- reschedule_event when he moves something to a different time. Never edit the time of an existing
  entry to do this — moving keeps the original as history, and that history is the whole point.
- activity_stats when the question is about pattern rather than a single day: how often something
  actually happens, when it usually sits, how much it slips.
- drop_event only for something logged by mistake.

Say what the log says, not what would be encouraging. If he has moved the same thing three times,
that is the useful sentence. Notice out loud when a pillar has gone quiet, when one activity is
always the one that slips, and when the time he keeps choosing is not a time that works.

Changing and deleting:
- Never show him an event id. They are for you.
- If more than one event could be the one he means, ask which — do not pick. If exactly one matches,
  act without asking.
- Say precisely what you changed or removed, with the old and new time where relevant, so a mistake
  is obvious straight away.
- Only delete when he asks you to cancel or remove something. Moving is an update, not a
  delete-and-recreate.

Style: direct and warm, like someone who knows him well. Lead with the answer. Skip preamble and
sign-offs. Under ~150 words unless he asks for more. When you have his schedule in front of you,
describe it as a day — what is fixed, where the gaps are — rather than reciting a list of times.

If a tool fails, say plainly what did not work and what would fix it. Never invent calendar
entries or claim to have saved something you did not.`;

const TOOLS: Tool[] = [
  {
    name: "read_calendar",
    description:
      "Read Google Calendar events in a time range. Use for schedule, availability, and day or week summaries.",
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
      },
      required: ["text"],
    },
  },
  {
    name: "log_event",
    description:
      "Record a commitment in the master log: something he plans to do, or something he has already done. Use alongside create_calendar_event for real time blocks.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short name, consistent across repeats (\"AI session\")." },
        details: { type: "string", description: "What it actually involves, in his framing." },
        pillar: {
          type: "string",
          enum: ["health", "wealth", "happiness", "wisdom", "general"],
          description: "Which part of his life this belongs to.",
        },
        kind: {
          type: "string",
          enum: ["event", "task", "habit"],
          description: "event = time block, task = to-do, habit = recurring intent. Defaults to event.",
        },
        start_iso: {
          type: "string",
          description:
            "Planned start as local time without offset (2026-08-01T21:00:00), or YYYY-MM-DD for a whole day. Omit for a backlog item with no time yet.",
        },
        end_iso: { type: "string", description: "Planned end, same format." },
        duration_minutes: {
          type: "number",
          description: "Use instead of end_iso when only the length is known.",
        },
        all_day: { type: "boolean" },
        status: {
          type: "string",
          enum: ["planned", "in_progress", "done", "partial", "skipped", "missed", "cancelled"],
          description: "Defaults to planned. Use done when logging something after the fact.",
        },
        priority: { type: "string", enum: ["low", "normal", "high", "critical"] },
        tags: { type: "array", items: { type: "string" } },
        location: { type: "string" },
        calendar_event_id: {
          type: "string",
          description: "Id returned by create_calendar_event, so the log and the calendar stay linked.",
        },
        reminder_minutes_before: { type: "number" },
        outcome_note: { type: "string", description: "How it went, when logging after the fact." },
        quality_rating: { type: "number", description: "1–5, only if he says how good it was." },
      },
      required: ["title"],
    },
  },
  {
    name: "read_events",
    description:
      "Read the commitment log: what was planned, what happened, what slipped. Defaults to today. Returns ids for changing entries.",
    input_schema: {
      type: "object",
      properties: {
        from_date: { type: "string", description: "YYYY-MM-DD. Defaults to today." },
        to_date: { type: "string", description: "YYYY-MM-DD, inclusive." },
        days: { type: "number", description: "Days from from_date when to_date is not given." },
        statuses: {
          type: "array",
          items: { type: "string" },
          description:
            "Filter: planned, in_progress, done, partial, skipped, missed, cancelled, postponed, preponed.",
        },
        open_only: { type: "boolean", description: "Only what is still outstanding." },
        pillar: { type: "string", enum: ["health", "wealth", "happiness", "wisdom"] },
        query: {
          type: "string",
          description: "Match on title. Searches all history rather than one day.",
        },
        include_unscheduled: { type: "boolean", description: "Include backlog items with no time." },
        limit: { type: "number" },
      },
      required: [],
    },
  },
  {
    name: "set_event_status",
    description:
      "Record how a logged commitment ended. Requires the id from read_events. Not for moving something — use reschedule_event.",
    input_schema: {
      type: "object",
      properties: {
        event_id: { type: "string", description: "From read_events." },
        status: {
          type: "string",
          enum: ["planned", "in_progress", "done", "partial", "skipped", "missed", "cancelled"],
        },
        note: { type: "string", description: "How it went, in his words." },
        quality_rating: { type: "number", description: "1–5." },
        started_iso: { type: "string", description: "When it actually started, local time." },
        ended_iso: { type: "string", description: "When it actually ended, local time." },
      },
      required: ["event_id", "status"],
    },
  },
  {
    name: "reschedule_event",
    description:
      "Move a logged commitment to a new time. Closes the original as postponed or preponed and opens a linked replacement, so the slip is on record. Requires the id from read_events.",
    input_schema: {
      type: "object",
      properties: {
        event_id: { type: "string", description: "From read_events." },
        new_start_iso: {
          type: "string",
          description: "New start as local time without offset (2026-08-02T21:00:00).",
        },
        new_end_iso: {
          type: "string",
          description: "New end. Omit to keep the original length.",
        },
        reason: { type: "string", description: "Why it moved, in his words." },
      },
      required: ["event_id", "new_start_iso"],
    },
  },
  {
    name: "activity_stats",
    description:
      "How an activity actually goes over time: follow-through, slippage, the hour it usually sits at, how late it tends to start.",
    input_schema: {
      type: "object",
      properties: {
        activity: { type: "string", description: "Name of one activity. Omit for all of them." },
        pillar: { type: "string", enum: ["health", "wealth", "happiness", "wisdom"] },
        limit: { type: "number" },
      },
      required: [],
    },
  },
  {
    name: "drop_event",
    description:
      "Remove an entry logged by mistake. Requires the id from read_events. Not for cancelling something real — that is set_event_status with cancelled.",
    input_schema: {
      type: "object",
      properties: {
        event_id: { type: "string", description: "From read_events." },
      },
      required: ["event_id"],
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

const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
const num = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? v : undefined;
const strArray = (v: unknown): string[] | undefined =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : undefined;

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
        });
      case "delete_calendar_event":
        return await deleteCalendarEvent({
          eventId: String(input.event_id ?? ""),
          timeZone,
        });
      case "log_note":
        return await logNote({
          userProfileId: ctx.userProfileId,
          text: String(input.text ?? ""),
          date: typeof input.date === "string" ? input.date : undefined,
          timeZone,
        });
      case "log_event":
        return await planEvent({
          userProfileId: ctx.userProfileId,
          timeZone,
          title: String(input.title ?? ""),
          details: str(input.details),
          pillar: str(input.pillar),
          kind: str(input.kind),
          priority: str(input.priority),
          startIso: str(input.start_iso),
          endIso: str(input.end_iso),
          durationMinutes: num(input.duration_minutes),
          allDay: typeof input.all_day === "boolean" ? input.all_day : undefined,
          status: str(input.status),
          tags: strArray(input.tags),
          location: str(input.location),
          calendarEventId: str(input.calendar_event_id),
          reminderMinutesBefore: num(input.reminder_minutes_before),
          outcomeNote: str(input.outcome_note),
          qualityRating: num(input.quality_rating),
        });
      case "read_events":
        return await listEvents({
          userProfileId: ctx.userProfileId,
          timeZone,
          fromDate: str(input.from_date),
          toDate: str(input.to_date),
          days: num(input.days),
          statuses: strArray(input.statuses),
          openOnly: typeof input.open_only === "boolean" ? input.open_only : undefined,
          pillar: str(input.pillar),
          query: str(input.query),
          includeUnscheduled:
            typeof input.include_unscheduled === "boolean" ? input.include_unscheduled : undefined,
          limit: num(input.limit),
        });
      case "set_event_status":
        return await setEventStatus({
          userProfileId: ctx.userProfileId,
          timeZone,
          eventId: String(input.event_id ?? ""),
          status: String(input.status ?? ""),
          note: str(input.note),
          qualityRating: num(input.quality_rating),
          startedIso: str(input.started_iso),
          endedIso: str(input.ended_iso),
        });
      case "reschedule_event":
        return await rescheduleEvent({
          userProfileId: ctx.userProfileId,
          timeZone,
          eventId: String(input.event_id ?? ""),
          newStartIso: String(input.new_start_iso ?? ""),
          newEndIso: str(input.new_end_iso),
          reason: str(input.reason),
        });
      case "activity_stats":
        return await summariseActivity({
          userProfileId: ctx.userProfileId,
          activityKey: str(input.activity),
          pillar: str(input.pillar),
          limit: num(input.limit),
        });
      case "drop_event":
        return await dropEvent({
          userProfileId: ctx.userProfileId,
          timeZone,
          eventId: String(input.event_id ?? ""),
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
      system: MAGNUS_SYSTEM,
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
