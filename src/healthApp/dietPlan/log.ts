/**
 * "Ate this" on a planned meal: logs it as a meal (with any portion changes) in one tap, links the
 * log to the plan entry, and marks the entry eaten. Undo removes the log and puts the entry back.
 */
import { randomUUID } from "node:crypto";

import { z } from "zod";

import { localDateKey } from "../../nutrition/localDate.js";
import { supabase } from "../../tools/clients.js";
import type { ActionContext } from "../actions.js";
import { deleteMeal, saveConfirmedMeal } from "../meals.js";
import { setQty } from "./adjust.js";
import { sumTotals, type PlanItem } from "./compose.js";
import type { PlanSlot } from "./targets.js";

export const eatInput = z.object({
  /** New quantity per item, in the order the plan lists them; 0 leaves an item out. */
  qty: z.array(z.number().min(0).max(20)).max(12).optional(),
});

type Entry = { id: string; status: string; title: string; metadata: Record<string, unknown> | null };

async function findEntry(ctx: ActionContext, date: string, slot: PlanSlot): Promise<Entry | null> {
  const { data, error } = await supabase
    .from("meal_plan_entries")
    .select("id, status, title, metadata")
    .eq("user_profile_id", ctx.userProfileId)
    .eq("local_date", date)
    .eq("meal_slot", slot)
    .eq("source", "plan")
    .in("status", ["planned", "logged", "partial"])
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
  | { ok: false; error: "future_date" | "meal_not_planned" | "already_logged" | "eat_out" | "nothing_to_log" | string };

export async function eatPlanned(ctx: ActionContext, date: string, slot: PlanSlot, input: z.infer<typeof eatInput>): Promise<EatResult> {
  if (date > localDateKey(ctx.now ?? new Date(), ctx.timezone)) return { ok: false, error: "future_date" };
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
  const { error } = await supabase
    .from("meal_plan_entries")
    .update({ status: "planned", metadata: meta, updated_at: new Date().toISOString() })
    .eq("id", entry.id);
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
  await supabase.from("meal_plan_entries").update({ status: "planned", metadata: meta, updated_at: new Date().toISOString() }).eq("id", row.id);
}
