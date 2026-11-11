/**
 * Storage for the routine (`health_routine_items`) and its follow-ups (`health_routine_checks`).
 * Saving a routine also writes the derived training days and gym slot to user_health_profile, so
 * everything that reads those (scoring, the Hevy check, the starting plan) stays in step.
 */
import { logger } from "../logger.js";
import { supabase } from "../tools/clients.js";
import { gymTimeOf, normalizeRoutine, trainingDaysOf, type RoutineCheck, type RoutineCheckStatus, type RoutineItem, type RoutineSwap } from "./routine.js";

type ItemRow = {
  id: string;
  activity_key: string;
  label: string;
  days: number[];
  start_time: string | null;
  duration_min: number;
  remind_before_min: number | null;
  check_after_min: number;
  position: number;
  swap?: RoutineSwap | null;
};

export function rowToItem(r: ItemRow): RoutineItem {
  return {
    id: String(r.id),
    activityKey: String(r.activity_key),
    label: String(r.label),
    days: (r.days ?? []).map(Number),
    startTime: r.start_time ? String(r.start_time).slice(0, 5) : null,
    durationMin: Number(r.duration_min),
    remindBeforeMin: r.remind_before_min == null ? null : Number(r.remind_before_min),
    checkAfterMin: Number(r.check_after_min),
    position: Number(r.position) || 0,
    swap: r.swap && typeof r.swap === "object" && r.swap.until ? r.swap : null,
  };
}

/** The routine, or null when it can't be read (e.g. the migration isn't applied yet). */
export async function loadRoutine(userProfileId: string): Promise<RoutineItem[] | null> {
  const { data, error } = await supabase
    .from("health_routine_items")
    // `*`: the swap column arrives with a later migration; a missing one must not break reads.
    .select("*")
    .eq("user_profile_id", userProfileId)
    .order("position", { ascending: true });
  if (error) {
    logger.debug?.({ error: error.message }, "routine not available");
    return null;
  }
  const items = ((data ?? []) as ItemRow[]).map(rowToItem);
  if (!items.length) return items;
  // Pauses (breaks.ts): an item's own, and a whole-plan pause on every item. Missing table → none.
  const { loadBreaks } = await import("./breaks.js");
  const recent = new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10);
  const breaks = (await loadBreaks(userProfileId, recent).catch(() => [])).filter((b) => b.endDate >= recent);
  if (!breaks.length) return items;
  return items.map((i) => {
    const pauses = breaks.filter((b) => b.scope === "plan" || b.itemId === i.id).map((b) => ({ from: b.startDate, until: b.endDate }));
    return pauses.length ? { ...i, pauses } : i;
  });
}

/** Replaces the whole routine. Items that keep their id keep their past follow-ups. */
export async function saveRoutine(
  userProfileId: string,
  items: ReturnType<typeof normalizeRoutine>,
): Promise<{ ok: true; items: RoutineItem[]; trainingDays: number[] } | { ok: false; error: string }> {
  const existing = await loadRoutine(userProfileId);
  if (existing === null) return { ok: false, error: "routine_unavailable" };
  const keepIds = new Set(existing.map((i) => i.id));

  const rows = items.map((i) => ({
    ...(i.id && keepIds.has(i.id) ? { id: i.id } : {}),
    user_profile_id: userProfileId,
    activity_key: i.activityKey,
    label: i.label,
    days: i.days,
    start_time: i.startTime,
    duration_min: i.durationMin,
    remind_before_min: i.remindBeforeMin,
    check_after_min: i.checkAfterMin,
    position: i.position,
    updated_at: new Date().toISOString(),
  }));
  const keep = rows.map((r) => r.id).filter((id): id is string => !!id);
  const gone = existing.filter((i) => !keep.includes(i.id)).map((i) => i.id);
  if (gone.length) {
    const del = await supabase.from("health_routine_items").delete().eq("user_profile_id", userProfileId).in("id", gone);
    if (del.error) return { ok: false, error: del.error.message };
  }
  const updates = rows.filter((r) => r.id);
  const inserts = rows.filter((r) => !r.id);
  if (updates.length) {
    const up = await supabase.from("health_routine_items").upsert(updates, { onConflict: "id" });
    if (up.error) return { ok: false, error: up.error.message };
  }
  if (inserts.length) {
    const ins = await supabase.from("health_routine_items").insert(inserts);
    if (ins.error) return { ok: false, error: ins.error.message };
  }

  const saved = (await loadRoutine(userProfileId)) ?? [];
  const trainingDays = trainingDaysOf(saved);
  const profile = await supabase
    .from("user_health_profile")
    .upsert({ user_profile_id: userProfileId, training_days: trainingDays, gym_time: gymTimeOf(saved) }, { onConflict: "user_profile_id" });
  if (profile.error) return { ok: false, error: profile.error.message };
  return { ok: true, items: saved, trainingDays };
}

export const checkKey = (itemId: string, date: string): string => `${itemId}|${date}`;

/** Follow-ups in the range, keyed "itemId|date". Empty when the table isn't there yet. */
export async function getRoutineChecks(userProfileId: string, from: string, to: string): Promise<Map<string, RoutineCheck>> {
  const { data, error } = await supabase
    .from("health_routine_checks")
    .select("item_id, local_date, label, status, reason, activity_id")
    .eq("user_profile_id", userProfileId)
    .gte("local_date", from)
    .lte("local_date", to);
  const out = new Map<string, RoutineCheck>();
  if (error || !data) return out;
  for (const r of data as Array<Record<string, unknown>>) {
    const c: RoutineCheck = {
      itemId: String(r.item_id),
      localDate: String(r.local_date),
      label: String(r.label),
      status: r.status as RoutineCheckStatus,
      reason: r.reason ? String(r.reason) : null,
      activityId: r.activity_id ? String(r.activity_id) : null,
    };
    out.set(checkKey(c.itemId, c.localDate), c);
  }
  return out;
}

/** The checks for one date, by item id. */
export function checksOn(all: Map<string, RoutineCheck>, date: string): Map<string, RoutineCheck> {
  const out = new Map<string, RoutineCheck>();
  for (const c of all.values()) if (c.localDate === date) out.set(c.itemId, c);
  return out;
}

/** Records the scheduler's result. False when that item/day was already checked. */
export async function insertRoutineCheck(userProfileId: string, c: RoutineCheck): Promise<boolean> {
  const { data, error } = await supabase
    .from("health_routine_checks")
    .upsert(
      {
        user_profile_id: userProfileId,
        item_id: c.itemId,
        local_date: c.localDate,
        label: c.label,
        status: c.status,
        reason: c.reason,
        activity_id: c.activityId,
      },
      { onConflict: "user_profile_id,item_id,local_date", ignoreDuplicates: true },
    )
    .select("id");
  if (error) {
    logger.warn({ error: error.message }, "routine check insert failed");
    return false;
  }
  return (data ?? []).length > 0;
}

/** The person's answer (or a later match), creating the row if the follow-up never ran. */
export async function saveRoutineCheckAnswer(userProfileId: string, c: RoutineCheck): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from("health_routine_checks").upsert(
    {
      user_profile_id: userProfileId,
      item_id: c.itemId,
      local_date: c.localDate,
      label: c.label,
      status: c.status,
      reason: c.reason,
      activity_id: c.activityId,
      answered_at: new Date().toISOString(),
    },
    { onConflict: "user_profile_id,item_id,local_date" },
  );
  return error ? { ok: false, error: error.message } : { ok: true };
}

/**
 * Puts a temporary stand-in on one routine item ("no gym till the 25th: an evening walk
 * instead"), or takes it off (null). It ends on its own after `until`.
 */
export async function setRoutineSwap(userProfileId: string, itemId: string, swap: RoutineSwap | null): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.from("health_routine_items").update({ swap, updated_at: new Date().toISOString() }).eq("user_profile_id", userProfileId).eq("id", itemId);
  return error ? { ok: false, error: error.message } : { ok: true };
}
