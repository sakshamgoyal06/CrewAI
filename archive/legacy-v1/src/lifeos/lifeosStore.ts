/**
 * LifeOS Postgres tables — goals, pillar status, joy tank.
 * List catalog (`magnus_user_lists`) remains canonical for list UX; these tables feed memory + morning brief.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "../logger.js";
import { supabase as defaultClient } from "../tools/clients.js";
import { loggableError } from "../util/loggableError.js";

export type LifeosStoreResult<T> = { ok: true; data: T } | { ok: false; error: string };

const GOAL_PILLARS = new Set([
  "health",
  "wealth",
  "build",
  "relationships",
  "learning",
  "life",
  "happiness",
]);

const PILLAR_STATUS_VALUES = new Set(["on_track", "at_risk", "deviating"]);
const GOAL_TIMEFRAMES = new Set(["north_star", "annual", "quarterly", "monthly", "weekly"]);
const GOAL_STATUSES = new Set(["active", "completed", "paused", "dropped"]);

export function normalizeLifeosPillar(raw?: string): string | null {
  const p = raw?.trim().toLowerCase();
  if (!p) {
    return null;
  }
  if (p === "joy" || p === "happiness") {
    return "happiness";
  }
  if (p === "wisdom") {
    return "learning";
  }
  if (p === "magnus" || p === "general") {
    return "life";
  }
  return GOAL_PILLARS.has(p) ? p : null;
}

function fail(context: string, error: unknown): { ok: false; error: string } {
  const message =
    (error as { message?: string } | null)?.message ??
    (error instanceof Error ? error.message : String(error));
  logger.warn({ err: loggableError(error), context }, "lifeos store failed");
  return { ok: false, error: message };
}

function client(deps?: { client?: SupabaseClient }): SupabaseClient {
  return deps?.client ?? defaultClient;
}

export async function createLifeosGoal(
  input: {
    userProfileId: string;
    title: string;
    pillar?: string;
    timeframe?: string;
    status?: string;
    description?: string;
    targetDate?: string;
  },
  deps?: { client?: SupabaseClient },
): Promise<LifeosStoreResult<{ id: string }>> {
  const title = input.title.trim();
  if (!title) {
    return { ok: false, error: "title is required" };
  }

  const pillar = normalizeLifeosPillar(input.pillar) ?? "life";
  const timeframe = GOAL_TIMEFRAMES.has(input.timeframe ?? "")
    ? (input.timeframe as string)
    : "weekly";
  const status = GOAL_STATUSES.has(input.status ?? "") ? (input.status as string) : "active";

  const { data, error } = await client(deps)
    .from("goals")
    .insert({
      user_profile_id: input.userProfileId,
      pillar,
      timeframe,
      title,
      description: input.description?.trim() || null,
      target_date: input.targetDate?.trim() || null,
      status,
      is_deleted: false,
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    return fail("createLifeosGoal", error ?? "no id returned");
  }
  return { ok: true, data: { id: String(data.id) } };
}

export async function upsertPillarStatus(
  input: {
    userProfileId: string;
    pillar: string;
    date: string;
    status: string;
    score?: number;
    summary?: string;
  },
  deps?: { client?: SupabaseClient },
): Promise<LifeosStoreResult<{ id: string }>> {
  const pillar = normalizeLifeosPillar(input.pillar);
  if (!pillar) {
    return { ok: false, error: `Unknown pillar: ${input.pillar}` };
  }
  const status = input.status.trim().toLowerCase();
  if (!PILLAR_STATUS_VALUES.has(status)) {
    return {
      ok: false,
      error: `status must be one of: ${[...PILLAR_STATUS_VALUES].join(", ")}`,
    };
  }
  const date = input.date.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { ok: false, error: "date must be YYYY-MM-DD" };
  }

  const sb = client(deps);
  const { data: existing } = await sb
    .from("pillar_status")
    .select("id")
    .eq("user_profile_id", input.userProfileId)
    .eq("pillar", pillar)
    .eq("date", date)
    .maybeSingle();

  const row = {
    user_profile_id: input.userProfileId,
    pillar,
    date,
    status,
    score: input.score ?? null,
    summary: input.summary?.trim() || null,
  };

  if (existing?.id) {
    const { data, error } = await sb
      .from("pillar_status")
      .update(row)
      .eq("id", existing.id)
      .select("id")
      .single();
    if (error || !data?.id) {
      return fail("upsertPillarStatus:update", error ?? "no id");
    }
    return { ok: true, data: { id: String(data.id) } };
  }

  const { data, error } = await sb.from("pillar_status").insert(row).select("id").single();
  if (error || !data?.id) {
    return fail("upsertPillarStatus:insert", error ?? "no id");
  }
  return { ok: true, data: { id: String(data.id) } };
}

export async function logHappinessReserve(
  input: {
    userProfileId: string;
    date: string;
    level: number;
    notes?: string;
    selfReportedState?: string;
    streakType?: string;
  },
  deps?: { client?: SupabaseClient },
): Promise<LifeosStoreResult<{ id: string }>> {
  const date = input.date.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { ok: false, error: "date must be YYYY-MM-DD" };
  }
  if (!Number.isFinite(input.level) || input.level < 0 || input.level > 100) {
    return { ok: false, error: "level must be a number from 0 to 100" };
  }

  const sb = client(deps);
  const { data: existing } = await sb
    .from("happiness_reserve")
    .select("id")
    .eq("user_profile_id", input.userProfileId)
    .eq("date", date)
    .maybeSingle();

  const row = {
    user_profile_id: input.userProfileId,
    date,
    level: input.level,
    notes: input.notes?.trim() || null,
    self_reported_state: input.selfReportedState?.trim() || null,
    streak_type: input.streakType?.trim() || null,
  };

  if (existing?.id) {
    const { data, error } = await sb
      .from("happiness_reserve")
      .update(row)
      .eq("id", existing.id)
      .select("id")
      .single();
    if (error || !data?.id) {
      return fail("logHappinessReserve:update", error ?? "no id");
    }
    return { ok: true, data: { id: String(data.id) } };
  }

  const { data, error } = await sb.from("happiness_reserve").insert(row).select("id").single();
  if (error || !data?.id) {
    return fail("logHappinessReserve:insert", error ?? "no id");
  }
  return { ok: true, data: { id: String(data.id) } };
}

export async function listActiveLifeosGoals(
  userProfileId: string,
  limit = 12,
  deps?: { client?: SupabaseClient },
): Promise<LifeosStoreResult<Array<{ id: string; title: string; pillar: string; status: string }>>> {
  const { data, error } = await client(deps)
    .from("goals")
    .select("id, title, pillar, status")
    .eq("user_profile_id", userProfileId)
    .eq("status", "active")
    .eq("is_deleted", false)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) {
    return fail("listActiveLifeosGoals", error);
  }
  const rows = (data ?? []).map((r) => ({
    id: String(r.id),
    title: String(r.title),
    pillar: String(r.pillar),
    status: String(r.status),
  }));
  return { ok: true, data: rows };
}
