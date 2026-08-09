/**
 * Read and soft-delete meal log sessions.
 */
import { supabase } from "../../tools/clients.js";
import { localDateKey } from "../localDate.js";
import { recomputeDailyRollup } from "./mealRollupStore.js";
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

export type DayRangeTotals = {
  from: string;
  to: string;
  days: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  sessionCount: number;
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
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  logged_at: string | null;
  created_at: string;
  component_index: number;
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

export async function getRecentSessions(
  userProfileId: string,
  limit: number,
): Promise<MealSessionSummary[]> {
  const { data, error } = await supabase
    .from("meal_logs")
    .select("meal_session_id")
    .eq("user_profile_id", userProfileId)
    .is("deleted_at", null)
    .order("logged_at", { ascending: false })
    .limit(limit * 5);

  if (error || !data?.length) {
    return [];
  }

  const seen = new Set<string>();
  const sessionIds: string[] = [];
  for (const row of data) {
    const sid = row.meal_session_id as string;
    if (!sid || seen.has(sid)) {
      continue;
    }
    seen.add(sid);
    sessionIds.push(sid);
    if (sessionIds.length >= limit) {
      break;
    }
  }

  const { data: rows, error: rowError } = await supabase
    .from("meal_logs")
    .select(
      "meal_session_id, local_date, date, meal_slot, log_kind, raw_text, calories, protein_g, carbs_g, fat_g, logged_at, created_at, component_index",
    )
    .eq("user_profile_id", userProfileId)
    .in("meal_session_id", sessionIds)
    .is("deleted_at", null);

  if (rowError || !rows?.length) {
    return [];
  }

  const bySession = new Map<string, MealLogRow[]>();
  for (const row of rows as MealLogRow[]) {
    const list = bySession.get(row.meal_session_id) ?? [];
    list.push(row);
    bySession.set(row.meal_session_id, list);
  }

  return sessionIds
    .map((sid) => {
      const sessionRows = bySession.get(sid);
      if (!sessionRows?.length) {
        return null;
      }
      sessionRows.sort((a, b) => a.component_index - b.component_index);
      const first = sessionRows[0]!;
      return {
        mealSessionId: sid,
        localDate: first.local_date ?? first.date ?? "",
        mealSlot: (first.meal_slot as MealSlot) ?? "unspecified",
        logKind: first.log_kind ?? "meal",
        rawText: first.raw_text,
        calories: sessionRows.reduce((s, r) => s + num(r.calories), 0),
        protein_g: sessionRows.reduce((s, r) => s + num(r.protein_g), 0),
        carbs_g: sessionRows.reduce((s, r) => s + num(r.carbs_g), 0),
        fat_g: sessionRows.reduce((s, r) => s + num(r.fat_g), 0),
        loggedAt: first.logged_at ?? first.created_at,
        componentCount: sessionRows.length,
      } satisfies MealSessionSummary;
    })
    .filter((s): s is MealSessionSummary => s !== null);
}

export async function getRangeTotals(
  userProfileId: string,
  fromDate: string,
  toDate: string,
): Promise<DayRangeTotals> {
  const { data, error } = await supabase
    .from("meal_logs")
    .select("calories, protein_g, carbs_g, fat_g, meal_session_id, local_date")
    .eq("user_profile_id", userProfileId)
    .gte("local_date", fromDate)
    .lte("local_date", toDate)
    .is("deleted_at", null);

  if (error || !data?.length) {
    return {
      from: fromDate,
      to: toDate,
      days: 0,
      calories: 0,
      protein_g: 0,
      carbs_g: 0,
      fat_g: 0,
      sessionCount: 0,
    };
  }

  const sessions = new Set<string>();
  const dates = new Set<string>();
  let calories = 0;
  let protein_g = 0;
  let carbs_g = 0;
  let fat_g = 0;

  for (const row of data) {
    calories += num(row.calories);
    protein_g += num(row.protein_g);
    carbs_g += num(row.carbs_g);
    fat_g += num(row.fat_g);
    if (row.meal_session_id) {
      sessions.add(row.meal_session_id as string);
    }
    if (row.local_date) {
      dates.add(row.local_date as string);
    }
  }

  return {
    from: fromDate,
    to: toDate,
    days: dates.size,
    calories: Math.round(calories),
    protein_g: Math.round(protein_g * 10) / 10,
    carbs_g: Math.round(carbs_g * 10) / 10,
    fat_g: Math.round(fat_g * 10) / 10,
    sessionCount: sessions.size,
  };
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

  await recomputeDailyRollup(userProfileId, localDate);
  return { ok: true, localDate };
}

export async function softDeleteMostRecentSession(
  userProfileId: string,
  timezone?: string | null,
): Promise<
  | { ok: true; localDate: string; mealSessionId: string; rawText: string }
  | { ok: false; error: string }
> {
  const recent = await getRecentSessions(userProfileId, 1);
  if (!recent.length) {
    return { ok: false, error: "no meals logged yet" };
  }
  const session = recent[0]!;
  const result = await softDeleteMealSession(userProfileId, session.mealSessionId, timezone);
  if (!result.ok) {
    return result;
  }
  return {
    ok: true,
    localDate: result.localDate,
    mealSessionId: session.mealSessionId,
    rawText: session.rawText,
  };
}
