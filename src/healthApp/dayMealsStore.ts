/**
 * Loads what the day meal list (dayMeals.ts) is built from: plan entries and meal logs. Kept apart
 * from dietPlan/store.ts so history and the snapshot can use it without an import cycle.
 */
import { supabase } from "../tools/clients.js";
import { buildDayMeals, entryLite, groupMeals, type DayMeals, type MealRow, type PlanEntryLite } from "./dayMeals.js";
import { dietPrefsInput } from "./dietPlan/prefs.js";
import type { PlanSlot } from "./dietPlan/targets.js";

/**
 * The plan's meals for a date range, by date, with the planned meal times. null when the person
 * hasn't set up a meal plan (then every log is simply "eaten").
 */
export async function loadPlanEntries(userProfileId: string, from: string, to: string): Promise<{ byDate: Map<string, PlanEntryLite[]>; times: Partial<Record<PlanSlot, string>> } | null> {
  const { data: prefRow, error: prefErr } = await supabase.from("health_diet_preferences").select("prefs").eq("user_profile_id", userProfileId).maybeSingle();
  if (prefErr) throw new Error(prefErr.message);
  const prefs = prefRow ? dietPrefsInput.safeParse(prefRow.prefs) : null;
  if (!prefs?.success) return null;
  const { data, error } = await supabase
    .from("meal_plan_entries")
    .select("local_date, meal_slot, title, status, metadata")
    .eq("user_profile_id", userProfileId)
    .eq("source", "plan")
    .gte("local_date", from)
    .lte("local_date", to)
    .in("status", ["planned", "logged", "partial", "skipped"]);
  if (error) throw new Error(error.message);
  const byDate = new Map<string, PlanEntryLite[]>();
  for (const r of (data ?? []) as Array<{ local_date: string; meal_slot: string; title: string; status: string; metadata: Record<string, unknown> | null }>) {
    const e = entryLite(r);
    if (e) byDate.set(r.local_date, [...(byDate.get(r.local_date) ?? []), e]);
  }
  const times: Partial<Record<PlanSlot, string>> = {};
  for (const m of prefs.data.meals) if (m.time) times[m.slot as PlanSlot] = m.time;
  return { byDate, times };
}

/** One day's meal list, loaded fresh (the snapshot, the nightly digest). */
export async function loadDayMeals(userProfileId: string, date: string, today: string): Promise<DayMeals> {
  const [plan, logs] = await Promise.all([
    loadPlanEntries(userProfileId, date, date).catch(() => null),
    supabase
      .from("meal_logs")
      .select("meal_session_id, local_date, meal_slot, raw_text, description, calories, protein_g, carbs_g, fat_g, logged_at, created_at, component_index")
      .eq("user_profile_id", userProfileId)
      .eq("local_date", date)
      .is("deleted_at", null),
  ]);
  if (logs.error) throw new Error(logs.error.message);
  return buildDayMeals({ date, today, plan: plan ? plan.byDate.get(date) ?? [] : null, logs: groupMeals((logs.data ?? []) as MealRow[]).get(date) ?? [], times: plan?.times });
}
