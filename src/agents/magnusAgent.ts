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
  listEventsTool,
  logEvent,
  rescheduleEventTool,
  updateEventStatus,
} from "./tools/eventLogTool.js";
import { logNote } from "./tools/logNoteTool.js";
import type { AgentContext, AgentResult } from "./types.js";
import { buildMagnusSystem, MAGNUS_CORE_SYSTEM } from "./magnusCorePrompt.js";

const MODEL = "claude-sonnet-4-6";
// A single turn can reasonably read the log, move something, and journal it: room for all three.
const MAX_TOOL_ROUNDS = 6;

/** @deprecated Use buildMagnusSystem(ctx) — core prompt is user-agnostic. */
export const MAGNUS_SYSTEM = MAGNUS_CORE_SYSTEM;

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
