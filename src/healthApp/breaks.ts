/**
 * Pauses ("breaks", to keep them apart from the account pause in accountStatus.ts): one routine
 * item, or the whole plan, paused for a reason up to a maximum length. Saksham approved the
 * design on 11 Nov 2026 (https://claude.ai/artifact/L3idC9NLebM9afSmGPe2hv):
 *
 * - The coach offers an alternative first (a routine swap); a pause needs a reason.
 * - At most 14 days for one item, 21 for the whole plan, 30 when sick or injured.
 * - At most 2 whole-plan pauses in 90 days; past that the coach suggests a goal reset.
 * - A whole-plan pause moves the goal deadline later by its length (back again for days not used).
 * - Billing doesn't change.
 *
 * Every job and score reads them: a paused item is off the routine those days (routine.ts onDate);
 * a paused plan has no reminders except the weekly weigh-in, no day close, no nightly note, and its
 * days drop out of the score.
 */
import { z } from "zod";

import { logger } from "../logger.js";
import { supabase } from "../tools/clients.js";
import { addDays, dayNumber } from "../util/time.js";

export const BREAK_REASONS = ["sick", "injured", "travel", "busy", "rest", "other"] as const;
export type BreakReason = (typeof BREAK_REASONS)[number];

export const MAX_ITEM_DAYS = 14;
export const MAX_PLAN_DAYS = 21;
export const MAX_HEALTH_DAYS = 30;
export const PLAN_BREAKS_PER_90 = 2;

export type Break = {
  id: string;
  scope: "item" | "plan";
  itemId: string | null;
  reason: BreakReason;
  note: string | null;
  startDate: string;
  endDate: string;
  endedAt: string | null;
};

export const breakInput = z.object({
  scope: z.enum(["item", "plan"]),
  itemId: z.string().uuid().optional(),
  reason: z.enum(BREAK_REASONS),
  note: z.string().trim().max(200).optional(),
  /** First day (default today) and last day, both local dates and both included. */
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export type BreakInput = z.infer<typeof breakInput>;

/** The longest a pause can run for this scope and reason. Pure. */
export function maxDays(scope: Break["scope"], reason: BreakReason): number {
  if (reason === "sick" || reason === "injured") return MAX_HEALTH_DAYS;
  return scope === "plan" ? MAX_PLAN_DAYS : MAX_ITEM_DAYS;
}

/** Days from `from` to `until`, both included. Pure. */
export const lengthOf = (from: string, until: string): number => dayNumber(until) - dayNumber(from) + 1;

/** A pause that covers `date`: started, not past its end, and not ended early before that day. Pure. */
export function covers(b: Pick<Break, "startDate" | "endDate" | "endedAt">, date: string, endedOn?: string | null): boolean {
  if (date < b.startDate || date > b.endDate) return false;
  return !(b.endedAt && endedOn != null && date >= endedOn);
}

/** The local date an early end took effect: from the day after it was ended. Stored as endDate. */
export function planBreakOn(breaks: Break[], date: string): Break | null {
  return breaks.find((b) => b.scope === "plan" && date >= b.startDate && date <= b.endDate) ?? null;
}

export function itemBreakOn(breaks: Break[], itemId: string, date: string): Break | null {
  return breaks.find((b) => b.scope === "item" && b.itemId === itemId && date >= b.startDate && date <= b.endDate) ?? null;
}

export type CheckResult = { ok: true; from: string; until: string } | { ok: false; error: "too_long" | "bad_dates" | "too_many_plan_breaks" | "item_required" | "already_paused"; max?: number };

/** Whether a new pause can start, under the limits. Pure. */
export function checkBreak(input: BreakInput, today: string, existing: Break[]): CheckResult {
  const from = input.from ?? today;
  if (from < today || input.until < from) return { ok: false, error: "bad_dates" };
  if (input.scope === "item" && !input.itemId) return { ok: false, error: "item_required" };
  const max = maxDays(input.scope, input.reason);
  if (lengthOf(from, input.until) > max) return { ok: false, error: "too_long", max };
  const overlaps = existing.filter((b) => b.scope === input.scope && (input.scope === "plan" || b.itemId === input.itemId) && b.endDate >= from && b.startDate <= input.until);
  if (overlaps.length) return { ok: false, error: "already_paused" };
  if (input.scope === "plan") {
    const recent = existing.filter((b) => b.scope === "plan" && b.startDate >= addDays(today, -90));
    if (recent.length >= PLAN_BREAKS_PER_90) return { ok: false, error: "too_many_plan_breaks" };
  }
  return { ok: true, from, until: input.until };
}

/** What to keep up during the pause, shown with it (never enforced). Pure. */
export function minimumsFor(scope: Break["scope"], gym: boolean): string[] {
  if (scope === "plan") return ["Weigh in once a week, same morning.", "Protein at least 80% of your target on most days.", "Keep moving: about 5,000 steps a day."];
  if (gym) return ["Steps, protein and sleep stay as they are.", "Your meals don't change."];
  return ["Everything else in your plan stays as it is."];
}

/** The line that goes with the pause, by reason. Pure. */
export function replyFor(reason: BreakReason): string {
  switch (reason) {
    case "sick":
    case "injured":
      return "Rest is part of training. Get better first; we'll restart gently.";
    case "travel":
      return "Enjoy it. The plan will be here to come back to.";
    case "busy":
      return "Fair. A short break beats dropping it altogether.";
    case "rest":
      return "Taking a planned rest is a good call. Come back fresh.";
    default:
      return "Noted. We'll pick it up again when it ends.";
  }
}

/** An alternative to offer before pausing, by what's paused and why; null when there isn't a sensible one. Pure. */
export function alternativeFor(scope: Break["scope"], reason: BreakReason, gym: boolean): string | null {
  if (scope === "plan") return reason === "travel" ? "Keep just the essentials while away: log one meal a day and keep walking, and pause nothing." : null;
  if (!gym) return reason === "busy" ? "A shorter version (10 to 15 minutes) instead of skipping it." : null;
  if (reason === "travel") return "A 20-minute hotel-room or bodyweight session, or 8,000 steps, in place of the gym.";
  if (reason === "injured") return "A walk in place of the gym, if the injury allows it.";
  if (reason === "busy") return "A 30-minute session instead of the full one.";
  return null;
}

// ---------- storage ----------

type Row = { id: string; scope: Break["scope"]; item_id: string | null; reason: BreakReason; note: string | null; start_date: string; end_date: string; ended_at: string | null };

const fromRow = (r: Row): Break => ({ id: r.id, scope: r.scope, itemId: r.item_id, reason: r.reason, note: r.note, startDate: r.start_date, endDate: r.end_date, endedAt: r.ended_at });

/** Pauses that end on or after `fromDate` (plus the last 90 days' plan pauses, for the limit). Empty when the table isn't there yet. */
export async function loadBreaks(userProfileId: string, fromDate: string): Promise<Break[]> {
  const { data, error } = await supabase
    .from("health_breaks")
    .select("id, scope, item_id, reason, note, start_date, end_date, ended_at")
    .eq("user_profile_id", userProfileId)
    .gte("end_date", addDays(fromDate, -90))
    .order("start_date", { ascending: true });
  if (error) {
    logger.debug?.({ error: error.message }, "breaks not available");
    return [];
  }
  return ((data ?? []) as Row[]).map(fromRow);
}

export async function saveBreak(userProfileId: string, b: Omit<Break, "id" | "endedAt">): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from("health_breaks")
    .insert({ user_profile_id: userProfileId, scope: b.scope, item_id: b.itemId, reason: b.reason, note: b.note, start_date: b.startDate, end_date: b.endDate })
    .select("id")
    .single();
  if (error) return { ok: false, error: /health_breaks/.test(error.message) ? "breaks_unavailable" : error.message };
  return { ok: true, id: String((data as { id: string }).id) };
}

/** Ends a pause early: its last day becomes yesterday (or it's dropped if it hadn't started). */
export async function endBreakEarly(userProfileId: string, id: string, today: string): Promise<{ ok: true; unusedDays: number; scope: Break["scope"] } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from("health_breaks")
    .select("id, scope, item_id, reason, note, start_date, end_date, ended_at")
    .eq("user_profile_id", userProfileId)
    .eq("id", id)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "not_found" };
  const b = fromRow(data as Row);
  if (b.endDate < today) return { ok: false, error: "already_over" };
  const now = new Date().toISOString();
  if (b.startDate >= today) {
    const del = await supabase.from("health_breaks").delete().eq("user_profile_id", userProfileId).eq("id", id);
    return del.error ? { ok: false, error: del.error.message } : { ok: true, unusedDays: lengthOf(b.startDate, b.endDate), scope: b.scope };
  }
  const last = addDays(today, -1);
  const up = await supabase.from("health_breaks").update({ end_date: last, ended_at: now }).eq("user_profile_id", userProfileId).eq("id", id);
  return up.error ? { ok: false, error: up.error.message } : { ok: true, unusedDays: lengthOf(today, b.endDate), scope: b.scope };
}
