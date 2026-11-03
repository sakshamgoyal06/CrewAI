/**
 * Coach memory: a short, visible list of things the coach was asked to remember about the person.
 *
 * The coach adds a line with the `remember` tool when the person says something durable that
 * changes how to coach them (a schedule, an injury, a food they can't stand). The whole list goes
 * into every turn's context block, so it is capped and each line is short. The person sees and
 * edits the same list on the You tab; nothing is remembered that they can't read.
 */
import { supabase } from "../tools/clients.js";

export const MEMORY_MAX_LINES = 30;
export const MEMORY_MAX_CHARS = 200;

export type MemorySource = "coach" | "person";
export type MemoryLine = { id: string; text: string; source: MemorySource; createdAt: string };

type Row = { id: string; text: string; source: MemorySource; created_at: string };

const toLine = (r: Row): MemoryLine => ({ id: r.id, text: r.text, source: r.source, createdAt: r.created_at });

/** Active lines, oldest first (the order the person sees). */
export async function loadCoachMemory(userProfileId: string): Promise<MemoryLine[]> {
  const { data, error } = await supabase
    .from("health_coach_memory")
    .select("id, text, source, created_at")
    .eq("user_profile_id", userProfileId)
    .is("forgotten_at", null)
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

/** Adds a line unless an equal one is already there. Refuses past the cap so the list stays short. */
export async function rememberLine(userProfileId: string, rawText: unknown, source: MemorySource): Promise<RememberResult> {
  const text = normalizeMemoryText(rawText);
  const lines = await loadCoachMemory(userProfileId);
  if (!text) return { ok: false, error: "empty", count: lines.length };
  const existing = lines.find((l) => same(l.text, text));
  if (existing) return { ok: true, line: existing, duplicate: true, count: lines.length };
  if (lines.length >= MEMORY_MAX_LINES) return { ok: false, error: "memory_full", count: lines.length };
  const { data, error } = await supabase
    .from("health_coach_memory")
    .insert({ user_profile_id: userProfileId, text, source })
    .select("id, text, source, created_at")
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
export async function forgetLine(userProfileId: string, idOrText: string): Promise<ForgetResult> {
  const lines = await loadCoachMemory(userProfileId);
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

/** Rewrites one line from the You tab. */
export async function editLine(userProfileId: string, id: string, rawText: unknown): Promise<{ ok: true; line: MemoryLine } | { ok: false; error: "empty" | "not_found" }> {
  const text = normalizeMemoryText(rawText);
  if (!text) return { ok: false, error: "empty" };
  const { data, error } = await supabase
    .from("health_coach_memory")
    .update({ text, source: "person", updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_profile_id", userProfileId)
    .is("forgotten_at", null)
    .select("id, text, source, created_at")
    .maybeSingle();
  if (error) throw new Error(`coach memory edit failed: ${error.message}`);
  return data ? { ok: true, line: toLine(data as Row) } : { ok: false, error: "not_found" };
}

/** The context-block line: everything remembered, in one sentence the coach can quote from. */
export function memoryContextLine(lines: Array<Pick<MemoryLine, "text">>): string | null {
  if (!lines.length) return null;
  return `Remembered about them (they see and edit this list on the You tab): ${lines.map((l) => l.text).join("; ")}.`;
}
