/**
 * Water: a glass at a time from the Today tab, or "had two glasses" in chat. Each log is its own
 * row (`health_water_logs`), the day's total is the sum, and Undo removes the latest one.
 * Not part of the on-track score: it's a nudge, not a rule.
 */
import { z } from "zod";
import { logger } from "../logger.js";
import { supabase } from "../tools/clients.js";
import { localDateKey } from "../nutrition/localDate.js";
import type { ActionContext, ActionResult } from "./actions.js";

/** Daily goal shown on Today: about 35 ml per kg, within 2–4 L; 2.5 L without a weight. */
export function waterTargetMl(weightKg: number | null): number {
  if (!weightKg || weightKg <= 0) return 2500;
  return Math.min(4000, Math.max(2000, Math.round((weightKg * 35) / 250) * 250));
}

export const waterInput = z.object({
  /** Millilitres to add (a glass is 250); or "undo" to remove the day's latest log. */
  ml: z.coerce.number().int().min(1).max(3000).optional(),
  undo: z.boolean().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}).refine((v) => v.undo || v.ml !== undefined, { message: "need ml or undo" });

type Deps = {
  insert: (row: { user_profile_id: string; local_date: string; ml: number; source: string }) => Promise<{ error: string | null }>;
  deleteLatest: (userProfileId: string, date: string) => Promise<{ error: string | null; deleted: boolean }>;
  dayTotals: typeof getWaterByDate;
};

const defaultDeps: Deps = {
  insert: async (row) => {
    const { error } = await supabase.from("health_water_logs").insert(row);
    return { error: error?.message ?? null };
  },
  deleteLatest: async (userProfileId, date) => {
    const { data, error } = await supabase
      .from("health_water_logs")
      .select("id")
      .eq("user_profile_id", userProfileId)
      .eq("local_date", date)
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) return { error: error.message, deleted: false };
    const id = (data ?? [])[0]?.id;
    if (!id) return { error: null, deleted: false };
    const del = await supabase.from("health_water_logs").delete().eq("id", id).eq("user_profile_id", userProfileId);
    return { error: del.error?.message ?? null, deleted: !del.error };
  },
  dayTotals: (id, from, to) => getWaterByDate(id, from, to),
};

export async function logWater(
  ctx: ActionContext,
  input: z.infer<typeof waterInput>,
  source: "quick_add" | "chat" = "quick_add",
  deps: Deps = defaultDeps,
): Promise<ActionResult<{ date: string; totalMl: number }>> {
  const today = localDateKey(ctx.now ?? new Date(), ctx.timezone);
  const date = input.date ?? today;
  if (date > today) return { ok: false, error: "future_date" };
  if (input.undo) {
    const r = await deps.deleteLatest(ctx.userProfileId, date);
    if (r.error) return { ok: false, error: r.error };
  } else {
    const r = await deps.insert({ user_profile_id: ctx.userProfileId, local_date: date, ml: input.ml!, source });
    if (r.error) return { ok: false, error: r.error };
  }
  const totals = await deps.dayTotals(ctx.userProfileId, date, date);
  return { ok: true, date, totalMl: totals.get(date) ?? 0 };
}

/** Millilitres per day. Empty (not an error) before the table exists, so the views still load. */
export async function getWaterByDate(userProfileId: string, from: string, to: string): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const { data, error } = await supabase
    .from("health_water_logs")
    .select("local_date, ml")
    .eq("user_profile_id", userProfileId)
    .gte("local_date", from)
    .lte("local_date", to);
  if (error) {
    logger.debug({ error: error.message }, "water read skipped");
    return out;
  }
  for (const r of (data ?? []) as Array<{ local_date: string; ml: number }>) {
    const d = String(r.local_date);
    out.set(d, (out.get(d) ?? 0) + (Number(r.ml) || 0));
  }
  return out;
}
