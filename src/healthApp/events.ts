/**
 * Telemetry for debugging (`health_app_events`): client events posted by the PWA and the
 * server's own per-route timings. Rows are buffered in memory and written in batches, so a
 * request never waits on this table. Failures are logged and dropped, never surfaced.
 */
import { z } from "zod";

import { logger } from "../logger.js";
import { supabase } from "../tools/clients.js";
import { loggableError } from "../util/loggableError.js";

const KINDS = ["page_load", "view", "tap", "api", "error", "hang", "vitals", "lifecycle"] as const;

const clientEvent = z.object({
  kind: z.enum(KINDS),
  name: z.string().max(200).nullish(),
  durationMs: z.number().finite().min(0).max(86_400_000).nullish(),
  status: z.number().int().min(0).max(999).nullish(),
  props: z.record(z.string(), z.unknown()).optional(),
  at: z.number().int().positive().optional(),
});

export const clientEventsInput = z.object({
  sessionId: z.string().max(64),
  appVersion: z.string().max(40).optional(),
  events: z.array(clientEvent).min(1).max(100),
});

export type EventRow = {
  user_profile_id: string | null;
  session_id: string | null;
  source: "client" | "server";
  kind: string;
  name: string | null;
  duration_ms: number | null;
  status: number | null;
  props: Record<string, unknown>;
  app_version: string | null;
  user_agent: string | null;
  occurred_at: string;
};

const MAX_PROPS_CHARS = 2000;
const MAX_BUFFER = 1000;
const FLUSH_MS = 5_000;
const RETENTION_DAYS = 30;
const PRUNE_EVERY_MS = 24 * 3_600_000;

/** Keeps props small; anything oversized is replaced with a truncated string. */
function clampProps(props: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!props) return {};
  const s = JSON.stringify(props);
  return s.length <= MAX_PROPS_CHARS ? props : { truncated: s.slice(0, MAX_PROPS_CHARS) };
}

/** Client clocks can be off; trust them only within a day of the server's clock. */
function occurredAt(at: number | undefined, now: number): string {
  return new Date(at && Math.abs(now - at) < 86_400_000 ? at : now).toISOString();
}

export function clientRows(
  userProfileId: string,
  input: z.infer<typeof clientEventsInput>,
  userAgent: string | undefined,
  now = Date.now(),
): EventRow[] {
  return input.events.map((e) => ({
    user_profile_id: userProfileId,
    session_id: input.sessionId,
    source: "client",
    kind: e.kind,
    name: e.name ?? null,
    duration_ms: e.durationMs == null ? null : Math.round(e.durationMs),
    status: e.status ?? null,
    props: clampProps(e.props),
    app_version: input.appVersion ?? null,
    user_agent: userAgent?.slice(0, 300) ?? null,
    occurred_at: occurredAt(e.at, now),
  }));
}

let buffer: EventRow[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let lastPrune = 0;

export function enqueueEvents(rows: EventRow[]): void {
  if (process.env.MAGNUS_HEALTH_EVENTS_OFF === "1" || !rows.length) return;
  buffer.push(...rows);
  if (buffer.length > MAX_BUFFER) buffer = buffer.slice(-MAX_BUFFER);
  if (!timer) {
    timer = setTimeout(() => void flushEvents(), FLUSH_MS);
    timer.unref?.();
  }
}

/** One server-side route timing; the client sends `x-magnus-session` so both sides line up. */
export function recordServerRoute(row: {
  userProfileId: string;
  route: string;
  method: string;
  path: string;
  status: number;
  durationMs: number;
  sessionId?: string;
  error?: string;
}): void {
  enqueueEvents([
    {
      user_profile_id: row.userProfileId,
      session_id: row.sessionId?.slice(0, 64) ?? null,
      source: "server",
      kind: "server_route",
      name: row.route,
      duration_ms: Math.round(row.durationMs),
      status: row.status,
      props: { method: row.method, path: row.path.slice(0, 200), ...(row.error ? { error: row.error.slice(0, 500) } : {}) },
      app_version: null,
      user_agent: null,
      occurred_at: new Date().toISOString(),
    },
  ]);
}

export async function flushEvents(): Promise<void> {
  if (timer) clearTimeout(timer);
  timer = null;
  const rows = buffer;
  buffer = [];
  if (rows.length) {
    const { error } = await supabase.from("health_app_events").insert(rows);
    if (error) logger.warn({ err: loggableError(error), dropped: rows.length }, "health app events insert failed");
  }
  if (Date.now() - lastPrune > PRUNE_EVERY_MS) {
    lastPrune = Date.now();
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000).toISOString();
    const { error } = await supabase.from("health_app_events").delete().lt("occurred_at", cutoff);
    if (error) logger.warn({ err: loggableError(error) }, "health app events prune failed");
  }
}

/** Test hook. */
export function _pendingEvents(): EventRow[] {
  return buffer;
}
