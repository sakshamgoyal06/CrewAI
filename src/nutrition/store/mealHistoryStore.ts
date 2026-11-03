/**
 * Read and soft-delete meal log sessions. (The Telegram-era range totals, slot edits and
 * day-wide deletes are in archive/src/nutrition/store/mealHistoryStore.ts.)
 */
import { supabase } from "../../tools/clients.js";
import { localDateKey } from "../localDate.js";
import type { MealSlot } from "../types.js";

export type MealSessionSummary = {
  mealSessionId: string;
  localDate: string;
  mealSlot: MealSlot;
  logKind: string;
  rawText: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  loggedAt: string;
  componentCount: number;
};

function num(v: unknown): number {
  if (v === null || v === undefined) {
    return 0;
  }
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

type MealLogRow = {
  meal_session_id: string;
  local_date: string | null;
  date: string | null;
  meal_slot: string | null;
  log_kind: string | null;
  raw_text: string;
  description?: string | null;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  logged_at: string | null;
  created_at: string;
  component_index: number;
  items?: unknown;
};

function dateColumnFilter(localDate: string): { column: "local_date" | "date"; value: string } {
  return { column: "local_date", value: localDate };
}

async function fetchSessionsForDate(
  userProfileId: string,
  localDate: string,
): Promise<MealSessionSummary[]> {
  const { column, value } = dateColumnFilter(localDate);

  let query = supabase
    .from("meal_logs")
    .select(
      "meal_session_id, local_date, date, meal_slot, log_kind, raw_text, calories, protein_g, carbs_g, fat_g, logged_at, created_at, component_index",
    )
    .eq("user_profile_id", userProfileId)
    .is("deleted_at", null)
    .order("logged_at", { ascending: false });

  query = query.eq(column, value);

  const { data, error } = await query;
  if (error || !data?.length) {
    return [];
  }

  const bySession = new Map<string, MealLogRow[]>();
  for (const row of data as MealLogRow[]) {
    const sid = row.meal_session_id;
    if (!sid) {
      continue;
    }
    const list = bySession.get(sid) ?? [];
    list.push(row);
    bySession.set(sid, list);
  }

  const summaries: MealSessionSummary[] = [];
  for (const [mealSessionId, rows] of bySession) {
    rows.sort((a, b) => a.component_index - b.component_index);
    const first = rows[0]!;
    summaries.push({
      mealSessionId,
      localDate: first.local_date ?? first.date ?? localDate,
      mealSlot: (first.meal_slot as MealSlot) ?? "unspecified",
      logKind: first.log_kind ?? "meal",
      rawText: first.raw_text,
      calories: rows.reduce((s, r) => s + num(r.calories), 0),
      protein_g: rows.reduce((s, r) => s + num(r.protein_g), 0),
      carbs_g: rows.reduce((s, r) => s + num(r.carbs_g), 0),
      fat_g: rows.reduce((s, r) => s + num(r.fat_g), 0),
      loggedAt: first.logged_at ?? first.created_at,
      componentCount: rows.length,
    });
  }

  summaries.sort((a, b) => b.loggedAt.localeCompare(a.loggedAt));
  return summaries;
}

export async function getSessionsForLocalDate(
  userProfileId: string,
  localDate: string,
): Promise<MealSessionSummary[]> {
  return fetchSessionsForDate(userProfileId, localDate);
}

export async function softDeleteMealSession(
  userProfileId: string,
  mealSessionId: string,
  timezone?: string | null,
): Promise<{ ok: true; localDate: string } | { ok: false; error: string }> {
  const { data: existing, error: fetchError } = await supabase
    .from("meal_logs")
    .select("local_date, date")
    .eq("user_profile_id", userProfileId)
    .eq("meal_session_id", mealSessionId)
    .is("deleted_at", null)
    .limit(1);

  if (fetchError) {
    return { ok: false, error: fetchError.message };
  }
  if (!existing?.length) {
    return { ok: false, error: "meal session not found" };
  }

  const localDate =
    (existing[0]!.local_date as string | null) ??
    (existing[0]!.date as string | null) ??
    localDateKey(new Date(), timezone);

  const deletedAt = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("meal_logs")
    .update({ deleted_at: deletedAt })
    .eq("user_profile_id", userProfileId)
    .eq("meal_session_id", mealSessionId)
    .is("deleted_at", null);

  if (updateError) {
    if (updateError.message.includes("deleted_at")) {
      return { ok: false, error: "soft delete not available — apply nutrition migration" };
    }
    return { ok: false, error: updateError.message };
  }

  return { ok: true, localDate };
}
