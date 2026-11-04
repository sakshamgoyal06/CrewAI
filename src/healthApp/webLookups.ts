/**
 * Monthly cap on web food lookups (OWASP LLM10, unbounded consumption). A meal the food catalog
 * and database can't answer goes to a paid web search; each person gets
 * `MAGNUS_WEB_LOOKUPS_PER_MONTH` of those per calendar month in their timezone (default 100).
 * Past it, meals still get estimated from the catalog, our food database, USDA and CalorieNinjas,
 * just without the web. This is separate from the daily spend caps in spend.ts.
 *
 * Every lookup is logged as a `web_lookup` event, and the first lookup of a month starts from those
 * rows, so a redeploy doesn't reset anyone. Set the limit to 0 to remove the cap.
 */
import { localDateKey } from "../nutrition/localDate.js";
import { logger } from "../logger.js";
import { supabase } from "../tools/clients.js";
import { loggableError } from "../util/loggableError.js";
import { localDayRange } from "./dailyChat.js";
import { enqueueEvents } from "./events.js";

export function webLookupLimit(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.MAGNUS_WEB_LOOKUPS_PER_MONTH?.trim();
  const n = raw ? Number.parseInt(raw, 10) : 100;
  return Number.isFinite(n) && n >= 0 ? n : 100;
}

/** "2026-11" for a local date key. */
export const monthOf = (day: string): string => day.slice(0, 7);

const used = new Map<string, { month: string; count: number }>();

export function lookupsThisMonth(userProfileId: string, month: string): number {
  const cur = used.get(userProfileId);
  return cur?.month === month ? cur.count : 0;
}

export function lookupsLeft(userProfileId: string, month: string, env: NodeJS.ProcessEnv = process.env): number {
  const limit = webLookupLimit(env);
  return limit === 0 ? Number.POSITIVE_INFINITY : Math.max(0, limit - lookupsThisMonth(userProfileId, month));
}

export function needsLookupSeed(userProfileId: string, month: string): boolean {
  return used.get(userProfileId)?.month !== month;
}

/** Starts the month from the lookups already logged (never lowers a live count). */
export function seedLookups(userProfileId: string, month: string, count: number): void {
  const cur = used.get(userProfileId);
  used.set(userProfileId, { month, count: Math.max(cur?.month === month ? cur.count : 0, count) });
  if (used.size > 20_000) for (const [k, v] of used) if (v.month !== month) used.delete(k);
}

/** Counts one lookup and logs it. Returns the month's count so far. */
export function countLookup(userProfileId: string, month: string): number {
  const cur = used.get(userProfileId);
  const count = (cur?.month === month ? cur.count : 0) + 1;
  used.set(userProfileId, { month, count });
  enqueueEvents([
    {
      user_profile_id: userProfileId,
      session_id: null,
      source: "server",
      kind: "web_lookup",
      name: "meal",
      duration_ms: null,
      status: 200,
      props: { month, count },
      app_version: null,
      user_agent: null,
      occurred_at: new Date().toISOString(),
    },
  ]);
  return count;
}

/** This month's lookups from the event log. A failed read starts from zero. */
export async function lookupsSince(userProfileId: string, fromIso: string): Promise<number> {
  try {
    const { count, error } = await supabase
      .from("health_app_events")
      .select("id", { count: "exact", head: true })
      .eq("user_profile_id", userProfileId)
      .eq("kind", "web_lookup")
      .gte("occurred_at", fromIso);
    if (error) throw new Error(error.message);
    return count ?? 0;
  } catch (err) {
    logger.warn({ err: loggableError(err) }, "web lookup seed read failed");
    return 0;
  }
}

/** What the meal estimator may do on the web for this person right now. */
export type WebGate = { allowed: boolean; onLookup: () => void; left: number };

export async function webGateFor(userProfileId: string, timezone: string, now: Date = new Date()): Promise<WebGate> {
  const day = localDateKey(now, timezone);
  const month = monthOf(day);
  if (needsLookupSeed(userProfileId, month)) {
    seedLookups(userProfileId, month, await lookupsSince(userProfileId, localDayRange(`${month}-01`, timezone).from));
  }
  const left = lookupsLeft(userProfileId, month);
  return { allowed: left > 0, left, onLookup: () => void countLookup(userProfileId, month) };
}

export function _resetLookups(): void {
  used.clear();
}
