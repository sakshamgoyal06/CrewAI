/**
 * Coach memory: a short, visible list of things the coach was asked to remember about the person.
 *
 * The coach adds a line with the `remember` tool when the person says something durable that
 * changes how to coach them (a schedule, an injury, a food they can't stand). The whole list goes
 * into every turn's context block, so it is capped and each line is short. The person sees and
 * edits the same list on the You tab; nothing is remembered that they can't read.
 *
 * A line can carry an end date ("travelling till Sunday"): from the day after, it drops out of
 * the context block and the You tab on its own, so a passing fact never goes stale in the coach.
 */
import { localDateKey } from "../nutrition/localDate.js";
import { supabase } from "../tools/clients.js";

export const MEMORY_MAX_LINES = 30;
export const MEMORY_MAX_CHARS = 200;

export type MemorySource = "coach" | "person";
export type MemoryLine = { id: string; text: string; source: MemorySource; createdAt: string; expiresOn?: string | null };

type Row = { id: string; text: string; source: MemorySource; created_at: string; expires_on?: string | null };

const COLS = "id, text, source, created_at, expires_on";

const toLine = (r: Row): MemoryLine => ({ id: r.id, text: r.text, source: r.source, createdAt: r.created_at, expiresOn: r.expires_on ?? null });

/** Today's local date for a person: the day a line with `expires_on` is last shown. */
export function memoryToday(timezone = "UTC", now: Date = new Date()): string {
  return localDateKey(now, timezone);
}

/** A YYYY-MM-DD end date that is a real day and not already past; anything else means "no end". */
export function normalizeUntil(until: unknown, today: string): string | null {
  if (typeof until !== "string") return null;
  const t = until.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  const d = new Date(`${t}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== t) return null;
  return t >= today ? t : null;
}

/** Active lines, oldest first (the order the person sees). Lines past their end date are left out. */
export async function loadCoachMemory(userProfileId: string, today: string = memoryToday()): Promise<MemoryLine[]> {
  const { data, error } = await supabase
    .from("health_coach_memory")
    .select(COLS)
    .eq("user_profile_id", userProfileId)
    .is("forgotten_at", null)
    .or(`expires_on.is.null,expires_on.gte.${today}`)
    .order("created_at", { ascending: true })
    .limit(MEMORY_MAX_LINES);
  if (error) throw new Error(`coach memory load failed: ${error.message}`);
  return ((data ?? []) as Row[]).map(toLine);
}

/** One line, trimmed to a sentence without a trailing full stop. Null when nothing is left. */
export function normalizeMemoryText(text: unknown): string | null {
  if (typeof text !== "string") return null;
  const t = text.replace(/\s+/g, " ").trim().replace(/[.\s]+$/, "");
  if (!t) return null;
  return t.length > MEMORY_MAX_CHARS ? `${t.slice(0, MEMORY_MAX_CHARS - 1).trimEnd()}…` : t;
}

const same = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "base" }) === 0;

export type RememberResult =
  | { ok: true; line: MemoryLine; duplicate: boolean; count: number }
  | { ok: false; error: "empty" | "memory_full"; count: number };

/**
 * Adds a line unless an equal one is already there. Refuses past the cap so the list stays short.
 * `until` (YYYY-MM-DD, local) ends a time-bound line; a repeat with a new end date updates it.
 */
export async function rememberLine(
  userProfileId: string,
  rawText: unknown,
  source: MemorySource,
  opts: { until?: unknown; today?: string } = {},
): Promise<RememberResult> {
  const today = opts.today ?? memoryToday();
  const text = normalizeMemoryText(rawText);
  const until = normalizeUntil(opts.until, today);
  const lines = await loadCoachMemory(userProfileId, today);
  if (!text) return { ok: false, error: "empty", count: lines.length };
  const existing = lines.find((l) => same(l.text, text));
  if (existing) {
    if (until && until !== existing.expiresOn) {
      const { error } = await supabase
        .from("health_coach_memory")
        .update({ expires_on: until, updated_at: new Date().toISOString() })
        .eq("id", existing.id)
        .eq("user_profile_id", userProfileId);
      if (error) throw new Error(`coach memory update failed: ${error.message}`);
      return { ok: true, line: { ...existing, expiresOn: until }, duplicate: true, count: lines.length };
    }
    return { ok: true, line: existing, duplicate: true, count: lines.length };
  }
  if (lines.length >= MEMORY_MAX_LINES) return { ok: false, error: "memory_full", count: lines.length };
  const { data, error } = await supabase
    .from("health_coach_memory")
    .insert({ user_profile_id: userProfileId, text, source, ...(until ? { expires_on: until } : {}) })
    .select(COLS)
    .single();
  if (error || !data) throw new Error(`coach memory insert failed: ${error?.message ?? "no row"}`);
  return { ok: true, line: toLine(data as Row), duplicate: false, count: lines.length + 1 };
}

export type ForgetResult =
  | { ok: true; forgotten: MemoryLine; count: number }
  | { ok: false; error: "not_found" | "ambiguous"; candidates: string[]; count: number };

/**
 * Forgets the one active line that matches: by id, or by text (equal, else the only line that
 * contains the words). Several matches come back as candidates so the coach can ask which.
 */
export async function forgetLine(userProfileId: string, idOrText: string, today: string = memoryToday()): Promise<ForgetResult> {
  const lines = await loadCoachMemory(userProfileId, today);
  const needle = idOrText.trim();
  let hits = lines.filter((l) => l.id === needle);
  if (!hits.length) hits = lines.filter((l) => same(l.text, needle));
  if (!hits.length && needle) {
    const n = needle.toLowerCase();
    hits = lines.filter((l) => l.text.toLowerCase().includes(n));
  }
  if (hits.length !== 1) {
    return { ok: false, error: hits.length ? "ambiguous" : "not_found", candidates: hits.map((h) => h.text), count: lines.length };
  }
  const hit = hits[0]!;
  const { error } = await supabase
    .from("health_coach_memory")
    .update({ forgotten_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", hit.id)
    .eq("user_profile_id", userProfileId);
  if (error) throw new Error(`coach memory forget failed: ${error.message}`);
  return { ok: true, forgotten: hit, count: lines.length - 1 };
}

/** Rewrites one line from the You tab. `until` sets or clears (null) its end date; left out, it stays. */
export async function editLine(
  userProfileId: string,
  id: string,
  rawText: unknown,
  opts: { until?: unknown; today?: string } = {},
): Promise<{ ok: true; line: MemoryLine } | { ok: false; error: "empty" | "not_found" }> {
  const text = normalizeMemoryText(rawText);
  if (!text) return { ok: false, error: "empty" };
  const patch: Record<string, unknown> = { text, source: "person", updated_at: new Date().toISOString() };
  if (opts.until !== undefined) patch.expires_on = normalizeUntil(opts.until, opts.today ?? memoryToday());
  const { data, error } = await supabase
    .from("health_coach_memory")
    .update(patch)
    .eq("id", id)
    .eq("user_profile_id", userProfileId)
    .is("forgotten_at", null)
    .select(COLS)
    .maybeSingle();
  if (error) throw new Error(`coach memory edit failed: ${error.message}`);
  return data ? { ok: true, line: toLine(data as Row) } : { ok: false, error: "not_found" };
}

/** The context-block line: everything remembered, in one sentence the coach can quote from. */
export function memoryContextLine(lines: Array<Pick<MemoryLine, "text" | "expiresOn">>): string | null {
  if (!lines.length) return null;
  return `Remembered about them (they see and edit this list on the You tab): ${lines.map((l) => (l.expiresOn ? `${l.text} (until ${l.expiresOn})` : l.text)).join("; ")}.`;
}
