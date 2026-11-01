#!/usr/bin/env node
/**
 * Google Calendar MCP server (stdio transport).
 *
 * Cursor config (.cursor/mcp.json):
 * {
 *   "mcpServers": {
 *     "google-calendar": {
 *       "command": "npx",
 *       "args": ["tsx", "mcp/google-calendar/server.mts"],
 *       "env": {
 *         "GOOGLE_OAUTH_CREDENTIALS": "/absolute/path/to/client_secret.json"
 *       }
 *     }
 *   }
 * }
 *
 * Run `npm run google-calendar:auth` once to authorize.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  createEvent,
  deleteEvent,
  getFreeBusy,
  listCalendars,
  listEvents,
  updateEvent,
} from "../../src/integrations/googleCalendar/operations.js";

const server = new McpServer({
  name: "magnus-google-calendar",
  version: "1.0.0",
});

server.tool(
  "list_calendars",
  "List Google calendars the authorized account can access.",
  {},
  async () => {
    const calendars = await listCalendars();
    return {
      content: [{ type: "text", text: JSON.stringify(calendars, null, 2) }],
    };
  },
);

server.tool(
  "list_events",
  "List calendar events in a time window. Defaults to now through 7 days ahead.",
  {
    calendarId: z
      .string()
      .optional()
      .describe('Calendar id (default "primary")'),
    timeMin: z
      .string()
      .optional()
      .describe("ISO 8601 lower bound (default: now)"),
    timeMax: z
      .string()
      .optional()
      .describe("ISO 8601 upper bound (default: +7 days)"),
    query: z
      .string()
      .optional()
      .describe("Free-text search filter on event title/description"),
    maxResults: z
      .number()
      .int()
      .min(1)
      .max(250)
      .optional()
      .describe("Max events to return (default 25)"),
  },
  async (args) => {
    const events = await listEvents(args);
    return {
      content: [{ type: "text", text: JSON.stringify(events, null, 2) }],
    };
  },
);

server.tool(
  "get_free_busy",
  "Check busy blocks across one or more calendars.",
  {
    calendarIds: z
      .array(z.string())
      .min(1)
      .describe('Calendar ids to check (e.g. ["primary"])'),
    timeMin: z.string().describe("ISO 8601 range start"),
    timeMax: z.string().describe("ISO 8601 range end"),
  },
  async (args) => {
    const busy = await getFreeBusy({
      timeMin: args.timeMin,
      timeMax: args.timeMax,
      calendarIds: args.calendarIds,
    });
    return {
      content: [{ type: "text", text: JSON.stringify(busy, null, 2) }],
    };
  },
);

server.tool(
  "create_event",
  "Create a calendar event. Use ISO dateTime strings for timed events, or YYYY-MM-DD for all-day.",
  {
    calendarId: z.string().optional().describe('Calendar id (default "primary")'),
    summary: z.string().describe("Event title"),
    description: z.string().optional(),
    location: z.string().optional(),
    start: z
      .string()
      .describe("Start: ISO 8601 dateTime or YYYY-MM-DD for all-day"),
    end: z
      .string()
      .describe("End: ISO 8601 dateTime or YYYY-MM-DD for all-day"),
    timeZone: z
      .string()
      .optional()
      .describe("IANA timezone for timed events (e.g. Asia/Kolkata)"),
  },
  async (args) => {
    const event = await createEvent(args);
    return {
      content: [{ type: "text", text: JSON.stringify(event, null, 2) }],
    };
  },
);

server.tool(
  "update_event",
  "Update fields on an existing event (only pass fields to change).",
  {
    calendarId: z.string().optional(),
    eventId: z.string().describe("Google event id"),
    summary: z.string().optional(),
    description: z.string().optional(),
    location: z.string().optional(),
    start: z.string().optional().describe("ISO dateTime or YYYY-MM-DD"),
    end: z.string().optional().describe("ISO dateTime or YYYY-MM-DD"),
    timeZone: z.string().optional(),
  },
  async (args) => {
    const event = await updateEvent(args);
    return {
      content: [{ type: "text", text: JSON.stringify(event, null, 2) }],
    };
  },
);

server.tool(
  "delete_event",
  "Delete a calendar event by id.",
  {
    calendarId: z.string().optional(),
    eventId: z.string(),
  },
  async (args) => {
    const result = await deleteEvent(args);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  },
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
