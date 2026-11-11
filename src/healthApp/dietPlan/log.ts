/**
 * "Ate this" on a planned meal: logs it as a meal (with any portion changes) in one tap, links the
 * log to the plan entry, and marks the entry eaten. Undo removes the log and puts the entry back.
 */
import { randomUUID } from "node:crypto";

import { z } from "zod";

import { localDateKey } from "../../nutrition/localDate.js";
import { localClock } from "../../util/time.js";
import { supabase } from "../../tools/clients.js";
import type { ActionContext } from "../actions.js";
import { deleteMeal, saveConfirmedMeal } from "../meals.js";
import { setQty } from "./adjust.js";
import { sumTotals, type PlanItem } from "./compose.js";
import type { PlanSlot } from "./targets.js";

export const eatInput = z.object({
  /** New quantity per item, in the order the plan lists them; 0 leaves an item out. */
  qty: z.array(z.number().min(0).max(20)).max(12).optional(),
  /** They confirmed they ate it, though it's more than an hour before the meal's time. */
  early: z.boolean().optional(),
});

/** "Ate this" this long before the meal's planned time asks once (5 Nov: dinner ticked at 6 pm, eaten out at 8:30). */
export const EARLY_TICK_MIN = 60;

/** True when `now` is more than an hour before the meal's planned time today. Pure. */
export function tooEarlyToTick(date: string, today: string, mealTime: string | null, nowMinutes: number): boolean {
  if (date !== today || !mealTime) return false;
  const [h, m] = mealTime.split(":").map(Number) as [number, number];
  return nowMinutes < h * 60 + m - EARLY_TICK_MIN;
}

type Entry = { id: string; status: string; title: string; metadata: Record<string, unknown> | null };

async function findEntry(ctx: ActionContext, date: string, slot: PlanSlot): Promise<Entry | null> {
  const { data, error } = await supabase
    .from("meal_plan_entries")
    .select("id, status, title, metadata")
    .eq("user_profile_id", ctx.userProfileId)
    .eq("local_date", date)
    .eq("meal_slot", slot)
    .eq("source", "plan")
    .in("status", ["planned", "logged", "partial", "skipped"])
    .limit(1);
  if (error) throw new Error(error.message);
  return ((data ?? [])[0] as Entry | undefined) ?? null;
}

/** The planned items at the portions they chose (same order; a 0 drops the item). */
export function portioned(items: PlanItem[], qty: number[] | undefined): PlanItem[] {
  if (!qty) return items;
  return items.flatMap((i, k) => {
    const q = qty[k];
    if (q === undefined || q === i.qty) return [i];
    return q > 0 ? [setQty(i, q)] : [];
  });
}

export type EatResult =
  | { ok: true; mealSessionId: string; status: "logged" | "partial"; totals: ReturnType<typeof sumTotals> }
  | { ok: false; error: "future_date" | "meal_not_planned" | "already_logged" | "eat_out" | "nothing_to_log" | string; mealTime?: string | null };

export async function eatPlanned(ctx: ActionContext, date: string, slot: PlanSlot, input: z.infer<typeof eatInput>): Promise<EatResult> {
  const now = ctx.now ?? new Date();
  const today = localDateKey(now, ctx.timezone);
  if (date > today) return { ok: false, error: "future_date" };
  if (!input.early && date === today) {
    const { data } = await supabase.from("health_diet_preferences").select("prefs").eq("user_profile_id", ctx.userProfileId).maybeSingle();
    const meals = ((data?.prefs as { meals?: Array<{ slot?: string; time?: string | null }> } | null)?.meals ?? []);
    const time = meals.find((m) => m.slot === slot)?.time ?? null;
    if (tooEarlyToTick(date, today, time, localClock(now, ctx.timezone).minutes)) return { ok: false, error: "too_early", mealTime: time };
  }
  const entry = await findEntry(ctx, date, slot);
  if (!entry) return { ok: false, error: "meal_not_planned" };
  if (entry.status !== "planned") return { ok: false, error: "already_logged" };
  const meta = entry.metadata ?? {};
  if (meta.kind === "eat_out") return { ok: false, error: "eat_out" };
  const planned = (meta.items as PlanItem[] | undefined) ?? [];
  const items = portioned(planned, input.qty);
  if (!items.length) return { ok: false, error: "nothing_to_log" };
  const changed = items.length !== planned.length || items.some((i, k) => i.qty !== planned[k]?.qty);

  const sessionId = randomUUID();
  const saved = await saveConfirmedMeal(
    ctx.userProfileId,
    {
      draftId: sessionId,
      text: items.map((i) => i.text).join(", "),
      slot,
      source: "food_db",
      items: items.map((i) => ({ name: i.text, calories: i.kcal, protein_g: i.proteinG, carbs_g: i.carbsG, fat_g: i.fatG })),
      edited: changed,
      localDate: date,
    },
    ctx.now,
  );
  if (!saved.ok) return saved;

  const status = changed ? "partial" : "logged";
  await supabase.from("meal_logs").update({ plan_entry_id: entry.id }).eq("user_profile_id", ctx.userProfileId).eq("meal_session_id", sessionId);
  const { error } = await supabase
    .from("meal_plan_entries")
    .update({ status, metadata: { ...meta, logged_session_id: sessionId, eaten_items: changed ? items : undefined }, updated_at: new Date().toISOString() })
    .eq("id", entry.id);
  if (error) throw new Error(error.message);
  return { ok: true, mealSessionId: sessionId, status, totals: sumTotals(items) };
}

export async function undoPlanned(ctx: ActionContext, date: string, slot: PlanSlot): Promise<{ ok: true } | { ok: false; error: string }> {
  const entry = await findEntry(ctx, date, slot);
  if (!entry || entry.status === "planned") return { ok: false, error: "nothing_to_undo" };
  const meta = { ...(entry.metadata ?? {}) };
  const sessionId = meta.logged_session_id as string | undefined;
  if (sessionId) {
    const r = await deleteMeal(ctx.userProfileId, sessionId, ctx.timezone);
    if (!r.ok && r.error !== "not_found") return r;
  }
  delete meta.logged_session_id;
  delete meta.eaten_items;
  delete meta.off_plan;
  delete meta.skipped_at;
  const { error } = await supabase
    .from("meal_plan_entries")
    .update({ status: "planned", metadata: meta, updated_at: new Date().toISOString() })
    .eq("id", entry.id);
  if (error) throw new Error(error.message);
  return { ok: true };
}

/**
 * "Skip" on a planned meal: they didn't eat it, for whatever reason. A skip is a logged zero for
 * that meal (11 Nov rule): only a skip counts as eating nothing; a meal with no entry is unlogged.
 * Undo (undoPlanned) puts it back to planned.
 */
export async function skipPlanned(ctx: ActionContext, date: string, slot: PlanSlot): Promise<{ ok: true } | { ok: false; error: "future_date" | "meal_not_planned" | "already_logged" }> {
  const today = localDateKey(ctx.now ?? new Date(), ctx.timezone);
  if (date > today) return { ok: false, error: "future_date" };
  const entry = await findEntry(ctx, date, slot);
  if (!entry) return { ok: false, error: "meal_not_planned" };
  if (entry.status !== "planned") return { ok: false, error: "already_logged" };
  const { error } = await supabase
    .from("meal_plan_entries")
    .update({ status: "skipped", metadata: { ...(entry.metadata ?? {}), skipped_at: new Date().toISOString() }, updated_at: new Date().toISOString() })
    .eq("id", entry.id)
    .eq("status", "planned");
  if (error) throw new Error(error.message);
  return { ok: true };
}

/** A logged meal was deleted from Today: the plan entry it ate goes back to planned. */
export async function unlinkDeletedMeal(userProfileId: string, mealSessionId: string): Promise<void> {
  const { data } = await supabase
    .from("meal_plan_entries")
    .select("id, metadata")
    .eq("user_profile_id", userProfileId)
    .eq("source", "plan")
    .eq("metadata->>logged_session_id", mealSessionId)
    .limit(1);
  const row = (data ?? [])[0] as { id: string; metadata: Record<string, unknown> } | undefined;
  if (!row) return;
  const meta = { ...row.metadata };
  delete meta.logged_session_id;
  delete meta.eaten_items;
  delete meta.off_plan;
  await supabase.from("meal_plan_entries").update({ status: "planned", metadata: meta, updated_at: new Date().toISOString() }).eq("id", row.id);
}
