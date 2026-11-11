/**
 * Undo and edit for what the coach chat recorded. Meals logged from a card can be changed (the
 * "Make your meal" editor) or taken back; things the coach wrote straight away (a weigh-in, steps,
 * water, a removed meal or activity) come back as a small "log receipt" card with Undo, and Edit
 * where a number can be changed. The receipt's state lives on the card in the chat row, so every
 * phone and the model's history see the same "undone" / "changed".
 */
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { supabase } from "../tools/clients.js";
import { logger } from "../logger.js";
import { loggableError } from "../util/loggableError.js";
import { localDateKey } from "../nutrition/localDate.js";
import type { ActionContext } from "./actions.js";
import { logCheckin, logSteps } from "./actions.js";
import { upsertBodyCheckin } from "./bodyStore.js";
import { logWater } from "./water.js";
import type { PlanItem } from "./dietPlan/compose.js";
import { afterMealLogged, rebalanceToday, redoCarry } from "./dietPlan/rhythm.js";

// ---------- logged meals ----------

export type LoggedItem = { name: string; calories: number; protein_g: number; carbs_g: number; fat_g: number };

export const mealReplaceInput = z.object({
  items: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(200),
        calories: z.coerce.number().min(0).max(10_000),
        protein_g: z.coerce.number().min(0).max(1000),
        carbs_g: z.coerce.number().min(0).max(1000),
        fat_g: z.coerce.number().min(0).max(1000),
      }),
    )
    .min(1)
    .max(30),
});

type MealRow = {
  id: string;
  local_date: string | null;
  date: string | null;
  meal_slot: string | null;
  meal_time: string | null;
  log_kind: string | null;
  raw_text: string | null;
  estimate_source: string | null;
  plan_entry_id: string | null;
  description: string | null;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  component_index: number | null;
};

const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const r1 = (v: number) => Math.round(v * 10) / 10;

async function liveRows(userProfileId: string, sessionId: string): Promise<MealRow[]> {
  const { data, error } = await supabase
    .from("meal_logs")
    .select("id, local_date, date, meal_slot, meal_time, log_kind, raw_text, estimate_source, plan_entry_id, description, calories, protein_g, carbs_g, fat_g, component_index")
    .eq("user_profile_id", userProfileId)
    .eq("meal_session_id", sessionId)
    .is("deleted_at", null);
  if (error) throw new Error(error.message);
  return ((data ?? []) as MealRow[]).sort((a, b) => n(a.component_index) - n(b.component_index));
}

/** What a logged meal holds now, one line per item, for the editor. */
export async function getLoggedMeal(
  userProfileId: string,
  sessionId: string,
): Promise<{ ok: true; date: string; slot: string; items: LoggedItem[] } | { ok: false; error: string }> {
  if (!z.string().uuid().safeParse(sessionId).success) return { ok: false, error: "invalid_id" };
  const rows = await liveRows(userProfileId, sessionId);
  if (!rows.length) return { ok: false, error: "meal_not_found" };
  return {
    ok: true,
    date: String(rows[0]!.local_date ?? rows[0]!.date),
    slot: String(rows[0]!.meal_slot ?? "snack"),
    items: rows.map((r) => ({ name: r.description ?? "Food", calories: Math.round(n(r.calories)), protein_g: r1(n(r.protein_g)), carbs_g: r1(n(r.carbs_g)), fat_g: r1(n(r.fat_g)) })),
  };
}

/** A logged item as a planned meal's "what was eaten" line. */
export function eatenItem(i: LoggedItem): PlanItem {
  return { key: null, name: i.name, servingId: null, qty: 1, text: i.name, grams: null, kcal: Math.round(i.calories), proteinG: r1(i.protein_g), carbsG: r1(i.carbs_g), fatG: r1(i.fat_g), fiberG: 0 };
}

/**
 * Edit of a logged meal: the same session (same day, slot and plan link) now holds these items. The
 * old rows are soft-deleted, so the change can be traced. A planned meal it ate shows the new food.
 */
export async function replaceLoggedMeal(
  ctx: ActionContext,
  sessionId: string,
  input: z.infer<typeof mealReplaceInput>,
): Promise<{ ok: true; date: string; totals: { calories: number; protein_g: number } } | { ok: false; error: string }> {
  if (!z.string().uuid().safeParse(sessionId).success) return { ok: false, error: "invalid_id" };
  const rows = await liveRows(ctx.userProfileId, sessionId);
  if (!rows.length) return { ok: false, error: "meal_not_found" };
  const first = rows[0]!;
  const date = String(first.local_date ?? first.date);
  const slot = first.meal_slot ?? "snack";
  const now = new Date().toISOString();

  const del = await supabase
    .from("meal_logs")
    .update({ deleted_at: now })
    .eq("user_profile_id", ctx.userProfileId)
    .eq("meal_session_id", sessionId)
    .is("deleted_at", null);
  if (del.error) return { ok: false, error: del.error.message };

  const source = first.estimate_source ?? "user";
  const inserted = await supabase.from("meal_logs").insert(
    input.items.map((item, idx) => ({
      user_profile_id: ctx.userProfileId,
      date,
      local_date: date,
      meal_time: first.meal_time ?? slot,
      meal_slot: slot,
      log_kind: first.log_kind ?? (slot === "snack" ? "snack" : "meal"),
      description: item.name.slice(0, 2000),
      raw_text: first.raw_text ?? item.name,
      macros: { protein_g: item.protein_g, carbs_g: item.carbs_g, fat_g: item.fat_g, estimate_source: source },
      calories: Math.round(item.calories),
      protein_g: item.protein_g,
      carbs_g: item.carbs_g,
      fat_g: item.fat_g,
      estimate_source: source,
      items: [item],
      provider_raw: idx === 0 ? { app_confirmed: true, user_edited: true } : null,
      source_channel: "api",
      meal_session_id: sessionId,
      component_index: idx,
      logged_at: now,
      plan_entry_id: first.plan_entry_id,
    })),
  );
  if (inserted.error) {
    // Put the old rows back rather than leave the meal gone.
    await supabase.from("meal_logs").update({ deleted_at: null }).in("id", rows.map((r) => r.id));
    return { ok: false, error: inserted.error.message };
  }

  // A planned meal eaten under this session now shows (and counts) what was really eaten.
  const { data: plan } = await supabase
    .from("meal_plan_entries")
    .select("id, metadata")
    .eq("user_profile_id", ctx.userProfileId)
    .eq("source", "plan")
    .eq("metadata->>logged_session_id", sessionId)
    .limit(1);
  const entry = (plan ?? [])[0] as { id: string; metadata: Record<string, unknown> | null } | undefined;
  if (entry) {
    await supabase
      .from("meal_plan_entries")
      .update({ status: "partial", metadata: { ...(entry.metadata ?? {}), eaten_items: input.items.map(eatenItem) }, updated_at: now })
      .eq("id", entry.id);
    if (date === localDateKey(ctx.now ?? new Date(), ctx.timezone)) {
      await rebalanceToday(ctx).catch((err) => logger.warn({ err: loggableError(err) }, "rebalance after meal edit failed"));
    }
  }
  if (date !== localDateKey(ctx.now ?? new Date(), ctx.timezone)) {
    await redoCarry(ctx, date).catch((err) => logger.warn({ err: loggableError(err) }, "carry redo after meal edit failed"));
  }
  const totals = input.items.reduce((a, i) => ({ calories: a.calories + Math.round(i.calories), protein_g: r1(a.protein_g + i.protein_g) }), { calories: 0, protein_g: 0 });
  return { ok: true, date, totals };
}

/** Undo of "remove that meal": the session's rows come back. */
async function restoreMeal(userProfileId: string, sessionId: string): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase
    .from("meal_logs")
    .select("deleted_at")
    .eq("user_profile_id", userProfileId)
    .eq("meal_session_id", sessionId)
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false })
    .limit(1);
  if (error) return { ok: false, error: error.message };
  const at = (data ?? [])[0]?.deleted_at as string | undefined;
  if (!at) return { ok: false, error: "nothing_to_undo" };
  // Only the rows that delete removed (an earlier edit's old rows stay deleted).
  const r = await supabase.from("meal_logs").update({ deleted_at: null }).eq("user_profile_id", userProfileId).eq("meal_session_id", sessionId).eq("deleted_at", at);
  return r.error ? { ok: false, error: r.error.message } : { ok: true };
}

/** A restored meal takes its planned meal's place again (or counts as extra), and today rebalances. */
async function relinkRestoredMeal(ctx: ActionContext, sessionId: string): Promise<void> {
  const { data } = await supabase
    .from("meal_logs")
    .select("local_date, meal_slot")
    .eq("user_profile_id", ctx.userProfileId)
    .eq("meal_session_id", sessionId)
    .is("deleted_at", null)
    .limit(1);
  const row = (data ?? [])[0] as { local_date: string; meal_slot: string | null } | undefined;
  if (!row?.meal_slot) return;
  await afterMealLogged(ctx, { date: String(row.local_date), slot: row.meal_slot, mealSessionId: sessionId });
}

async function restoreActivity(userProfileId: string, id: string): Promise<{ ok: boolean; error?: string }> {
  const r = await supabase
    .from("health_activities")
    .update({ deleted_at: null, updated_at: new Date().toISOString() })
    .eq("user_profile_id", userProfileId)
    .eq("id", id)
    .not("deleted_at", "is", null)
    .select("id");
  if (r.error) return { ok: false, error: r.error.message };
  return (r.data ?? []).length ? { ok: true } : { ok: false, error: "nothing_to_undo" };
}

// ---------- receipts for what the coach wrote straight away ----------

type BodyValues = { weightKg: number | null; bodyFatPct: number | null; muscleMassKg: number | null };

export type LogReceiptCard = {
  type: "log_receipt";
  receiptId: string;
  date: string;
  /** "undone" after Undo, "edited" after Edit; absent while it stands as logged. */
  state?: "undone" | "edited";
} & (
  | { kind: "weigh_in"; value: BodyValues; before: BodyValues | null }
  | { kind: "steps"; value: { steps: number }; before: { steps: number | null } | null }
  | { kind: "water"; value: { ml: number } }
  | { kind: "meal_removed"; value: { mealSessionId: string; text: string; calories: number } }
  | { kind: "activity_removed"; value: { activityId: string; label: string; durationMin: number } }
);

type DistOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type ReceiptDraft = DistOmit<LogReceiptCard, "receiptId" | "state"> & { receiptId?: string };

/** Stamps a receipt with its id. */
export function receipt(r: ReceiptDraft): LogReceiptCard {
  return { ...r, receiptId: r.receiptId ?? randomUUID() } as LogReceiptCard;
}

const fmt1 = (v: number) => String(Math.round(v * 10) / 10);

/** The receipt's one-line description ("Weigh-in · 72.4 kg · 18% body fat"). */
export function receiptLine(c: LogReceiptCard): string {
  switch (c.kind) {
    case "weigh_in": {
      const v = c.value;
      return ["Weigh-in", v.weightKg != null ? `${fmt1(v.weightKg)} kg` : null, v.bodyFatPct != null ? `${fmt1(v.bodyFatPct)}% body fat` : null, v.muscleMassKg != null ? `${fmt1(v.muscleMassKg)} kg muscle` : null].filter(Boolean).join(" · ");
    }
    case "steps":
      return `Steps · ${c.value.steps.toLocaleString("en-IN")}`;
    case "water":
      return `Water · ${c.value.ml} ml`;
    case "meal_removed":
      return `Removed meal · ${c.value.text}`;
    case "activity_removed":
      return `Removed activity · ${c.value.label} · ${c.value.durationMin} min`;
  }
}

/** The day's body check-in before the coach writes over it (null when there was none). */
export async function bodyBefore(userProfileId: string, date: string): Promise<BodyValues | null> {
  const { data } = await supabase
    .from("health_body_checkins")
    .select("weight_kg, body_fat_pct, muscle_mass_kg")
    .eq("user_profile_id", userProfileId)
    .eq("local_date", date)
    .maybeSingle();
  if (!data) return null;
  const v = (x: unknown) => (x == null ? null : Number(x));
  return { weightKg: v(data.weight_kg), bodyFatPct: v(data.body_fat_pct), muscleMassKg: v(data.muscle_mass_kg) };
}

/** The day's step total before the coach writes over it. */
export async function stepsBefore(userProfileId: string, date: string): Promise<{ steps: number | null } | null> {
  const { data } = await supabase.from("health_daily_activity").select("steps").eq("user_profile_id", userProfileId).eq("local_date", date).maybeSingle();
  return data ? { steps: data.steps == null ? null : Number(data.steps) } : null;
}

async function findReceipt(userProfileId: string, receiptId: string): Promise<{ rowId: string; cards: LogReceiptCard[]; index: number } | null> {
  const { data, error } = await supabase
    .from("health_chat_messages")
    .select("id, cards")
    .eq("user_profile_id", userProfileId)
    .contains("cards", [{ receiptId }])
    .limit(1);
  if (error) throw new Error(error.message);
  const row = (data ?? [])[0] as { id: string; cards: LogReceiptCard[] } | undefined;
  if (!row) return null;
  const index = row.cards.findIndex((c) => c.type === "log_receipt" && c.receiptId === receiptId);
  return index < 0 ? null : { rowId: row.id, cards: row.cards, index };
}

async function storeReceipt(found: { rowId: string; cards: LogReceiptCard[]; index: number }, card: LogReceiptCard): Promise<void> {
  const cards = found.cards.map((c, k) => (k === found.index ? card : c));
  const { error } = await supabase.from("health_chat_messages").update({ cards }).eq("id", found.rowId);
  if (error) throw new Error(error.message);
}

type ReceiptResult = { ok: true; card: LogReceiptCard } | { ok: false; error: string };

/** Undo: puts back what was there before the coach wrote it. */
export async function undoReceipt(ctx: ActionContext, receiptId: string): Promise<ReceiptResult> {
  if (!z.string().uuid().safeParse(receiptId).success) return { ok: false, error: "invalid_id" };
  const found = await findReceipt(ctx.userProfileId, receiptId);
  if (!found) return { ok: false, error: "not_found" };
  const card = found.cards[found.index]!;
  if (card.state === "undone") return { ok: true, card };
  const uid = ctx.userProfileId;

  let r: { ok: boolean; error?: string };
  switch (card.kind) {
    case "weigh_in":
      if (card.before) {
        r = await upsertBodyCheckin(uid, { localDate: card.date, weight_kg: card.before.weightKg, body_fat_pct: card.before.bodyFatPct, muscle_mass_kg: card.before.muscleMassKg });
      } else {
        const d = await supabase.from("health_body_checkins").delete().eq("user_profile_id", uid).eq("local_date", card.date);
        r = d.error ? { ok: false, error: d.error.message } : { ok: true };
      }
      break;
    case "steps": {
      const u = await supabase.from("health_daily_activity").update({ steps: card.before?.steps ?? null, updated_at: new Date().toISOString() }).eq("user_profile_id", uid).eq("local_date", card.date);
      r = u.error ? { ok: false, error: u.error.message } : { ok: true };
      break;
    }
    case "water":
      r = await logWater(ctx, { undo: true, date: card.date });
      break;
    case "meal_removed":
      r = await restoreMeal(uid, card.value.mealSessionId);
      if (r.ok) await relinkRestoredMeal(ctx, card.value.mealSessionId).catch((err) => logger.warn({ err: loggableError(err) }, "relink after meal restore failed"));
      break;
    case "activity_removed":
      r = await restoreActivity(uid, card.value.activityId);
      break;
  }
  if (!r.ok) return { ok: false, error: r.error ?? "undo_failed" };
  const next = { ...card, state: "undone" as const };
  await storeReceipt(found, next);
  return { ok: true, card: next };
}

export const receiptEditInput = z.object({
  weightKg: z.coerce.number().min(25).max(350).optional(),
  bodyFatPct: z.coerce.number().min(2).max(70).optional(),
  muscleMassKg: z.coerce.number().min(10).max(150).optional(),
  steps: z.coerce.number().int().min(0).max(200_000).optional(),
});

/** Edit: a weigh-in's numbers or a step total, written over the same day. */
export async function editReceipt(ctx: ActionContext, receiptId: string, input: z.infer<typeof receiptEditInput>): Promise<ReceiptResult> {
  if (!z.string().uuid().safeParse(receiptId).success) return { ok: false, error: "invalid_id" };
  const found = await findReceipt(ctx.userProfileId, receiptId);
  if (!found) return { ok: false, error: "not_found" };
  const card = found.cards[found.index]!;
  if (card.kind === "weigh_in") {
    if (input.weightKg === undefined && input.bodyFatPct === undefined && input.muscleMassKg === undefined) return { ok: false, error: "nothing_to_save" };
    const value: BodyValues = { weightKg: input.weightKg ?? null, bodyFatPct: input.bodyFatPct ?? null, muscleMassKg: input.muscleMassKg ?? null };
    const r = await logCheckin(ctx, { date: card.date, weightKg: input.weightKg, bodyFatPct: input.bodyFatPct, muscleMassKg: input.muscleMassKg });
    if (!r.ok) return r;
    const next: LogReceiptCard = { ...card, value, state: "edited" };
    await storeReceipt(found, next);
    return { ok: true, card: next };
  }
  if (card.kind === "steps") {
    if (input.steps === undefined) return { ok: false, error: "nothing_to_save" };
    const r = await logSteps(ctx, { date: card.date, steps: input.steps, source: "manual" });
    if (!r.ok) return r;
    const next: LogReceiptCard = { ...card, value: { steps: input.steps }, state: "edited" };
    await storeReceipt(found, next);
    return { ok: true, card: next };
  }
  return { ok: false, error: "not_editable" };
}
