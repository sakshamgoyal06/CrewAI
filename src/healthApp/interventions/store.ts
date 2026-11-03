/** Storage for `health_interventions`. */
import { logger } from "../../logger.js";
import { supabase } from "../../tools/clients.js";
import type { Intervention, InterventionStatus } from "./types.js";

export const COLS =
  "id, pattern, cause, area, item_id, item_label, local_date, title, evidence, facts, options, recommendation, status, chosen_option, before, applied, deferred, baseline, review_on, verdict, created_at, answered_at, started_at, closed_at";

export function fromRow(r: Record<string, unknown>): Intervention {
  const s = (v: unknown) => (v === null || v === undefined ? null : String(v));
  return {
    id: String(r.id),
    pattern: r.pattern as Intervention["pattern"],
    cause: r.cause as Intervention["cause"],
    area: String(r.area),
    itemId: s(r.item_id),
    itemLabel: s(r.item_label),
    localDate: String(r.local_date),
    title: String(r.title),
    evidence: (r.evidence as string[]) ?? [],
    facts: (r.facts as Intervention["facts"]) ?? {},
    options: (r.options as Intervention["options"]) ?? [],
    recommendation: s(r.recommendation),
    status: r.status as InterventionStatus,
    chosenOption: s(r.chosen_option),
    before: (r.before as Intervention["before"]) ?? null,
    applied: (r.applied as Intervention["applied"]) ?? null,
    deferred: (r.deferred as Intervention["deferred"]) ?? null,
    baseline: (r.baseline as Intervention["baseline"]) ?? null,
    reviewOn: s(r.review_on)?.slice(0, 10) ?? null,
    verdict: s(r.verdict),
    createdAt: String(r.created_at),
    answeredAt: s(r.answered_at),
    startedAt: s(r.started_at),
    closedAt: s(r.closed_at),
  };
}

/** The person's recent interventions, newest first (empty when the table isn't there yet). */
export async function listInterventions(userProfileId: string, sinceDays = 60): Promise<Intervention[]> {
  const since = new Date(Date.now() - sinceDays * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from("health_interventions")
    .select(COLS)
    .eq("user_profile_id", userProfileId)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) {
    logger.debug?.({ error: error.message }, "interventions not available");
    return [];
  }
  return ((data ?? []) as Array<Record<string, unknown>>).map(fromRow);
}

export async function getInterventions(userProfileId: string, ids: string[]): Promise<Map<string, Intervention>> {
  const out = new Map<string, Intervention>();
  if (!ids.length) return out;
  const { data, error } = await supabase.from("health_interventions").select(COLS).eq("user_profile_id", userProfileId).in("id", ids);
  if (error) return out;
  for (const r of (data ?? []) as Array<Record<string, unknown>>) {
    const i = fromRow(r);
    out.set(i.id, i);
  }
  return out;
}

export async function getIntervention(userProfileId: string, id: string): Promise<Intervention | null> {
  return (await getInterventions(userProfileId, [id])).get(id) ?? null;
}

export async function insertIntervention(userProfileId: string, row: Record<string, unknown>): Promise<Intervention | null> {
  const { data, error } = await supabase.from("health_interventions").insert({ user_profile_id: userProfileId, ...row }).select(COLS).single();
  if (error || !data) {
    logger.warn({ error: error?.message }, "intervention save failed");
    return null;
  }
  return fromRow(data as Record<string, unknown>);
}

/**
 * Moves a row to a new state, only from the state the caller read (so two taps can't both apply
 * a trial). Null when the row had already moved on.
 */
export async function updateIntervention(
  userProfileId: string,
  id: string,
  from: InterventionStatus[],
  patch: Record<string, unknown>,
): Promise<Intervention | null> {
  const { data, error } = await supabase
    .from("health_interventions")
    .update(patch)
    .eq("user_profile_id", userProfileId)
    .eq("id", id)
    .in("status", from)
    .select(COLS);
  if (error) {
    logger.warn({ error: error.message }, "intervention update failed");
    return null;
  }
  const row = ((data ?? []) as Array<Record<string, unknown>>)[0];
  return row ? fromRow(row) : null;
}
