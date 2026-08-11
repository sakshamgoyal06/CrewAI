/**
 * Persisted meal plan CRUD + plan-log linking.
 */
import { logger } from "../../logger.js";
import { supabase } from "../../tools/clients.js";
import { loggableError } from "../../util/loggableError.js";
import { offsetDateKey, type MealPlanEntryInput } from "../parseMealPlanJson.js";
import type { MealSlot } from "../types.js";

export type MealPlanStatus = "planned" | "logged" | "skipped" | "swapped" | "partial";

export type MealPlanEntryRow = {
  id: string;
  user_profile_id: string;
  local_date: string;
  meal_slot: Exclude<MealSlot, "unspecified">;
  title: string;
  description: string | null;
  status: MealPlanStatus;
  linked_meal_session_id: string | null;
  source: string;
};

export type SavePlanResult =
  | { ok: true; savedCount: number; dates: string[] }
  | { ok: false; error: string };

export type PlanLinkResult = {
  linked: boolean;
  planTitle?: string;
  matched: boolean;
};

function isTableMissing(msg: string): boolean {
  return (
    msg.includes("meal_plan_entries") ||
    msg.includes("schema cache") ||
    msg.includes("does not exist")
  );
}

function slotLabel(slot: string): string {
  return slot.charAt(0).toUpperCase() + slot.slice(1);
}

export async function savePlanEntries(
  userProfileId: string,
  entries: MealPlanEntryInput[],
  source: "chat" | "template" | "copied" | "auto" = "chat",
): Promise<SavePlanResult> {
  if (!entries.length) {
    return { ok: false, error: "no plan entries to save" };
  }

  const keys = new Set(entries.map((e) => `${e.local_date}|${e.meal_slot}`));

  for (const key of keys) {
    const [local_date, meal_slot] = key.split("|");
    const { error: delError } = await supabase
      .from("meal_plan_entries")
      .delete()
      .eq("user_profile_id", userProfileId)
      .eq("local_date", local_date!)
      .eq("meal_slot", meal_slot!)
      .eq("status", "planned");

    if (delError && !isTableMissing(delError.message)) {
      logger.warn({ err: loggableError(delError) }, "meal plan delete before save failed");
      return { ok: false, error: delError.message };
    }
  }

  const rows = entries.map((e) => ({
    user_profile_id: userProfileId,
    local_date: e.local_date,
    meal_slot: e.meal_slot,
    title: e.title.slice(0, 500),
    description: e.description?.slice(0, 2000) ?? null,
    status: "planned" as const,
    source,
  }));

  const { error } = await supabase.from("meal_plan_entries").insert(rows);
  if (error) {
    if (isTableMissing(error.message)) {
      return { ok: false, error: "meal_plan_entries table missing — apply nutrition phase 2 migration" };
    }
    return { ok: false, error: error.message };
  }

  const dates = [...new Set(entries.map((e) => e.local_date))].sort();
  return { ok: true, savedCount: rows.length, dates };
}

export async function getPlanEntriesForDate(
  userProfileId: string,
  localDate: string,
): Promise<MealPlanEntryRow[]> {
  const { data, error } = await supabase
    .from("meal_plan_entries")
    .select(
      "id, user_profile_id, local_date, meal_slot, title, description, status, linked_meal_session_id, source",
    )
    .eq("user_profile_id", userProfileId)
    .eq("local_date", localDate)
    .in("status", ["planned", "logged", "partial"])
    .order("meal_slot", { ascending: true });

  if (error || !data) {
    return [];
  }
  return data as MealPlanEntryRow[];
}

export async function getPlanEntriesForRange(
  userProfileId: string,
  fromDate: string,
  toDate: string,
): Promise<MealPlanEntryRow[]> {
  const { data, error } = await supabase
    .from("meal_plan_entries")
    .select(
      "id, user_profile_id, local_date, meal_slot, title, description, status, linked_meal_session_id, source",
    )
    .eq("user_profile_id", userProfileId)
    .gte("local_date", fromDate)
    .lte("local_date", toDate)
    .in("status", ["planned", "logged", "partial", "skipped"])
    .order("local_date", { ascending: true })
    .order("meal_slot", { ascending: true });

  if (error || !data) {
    return [];
  }
  return data as MealPlanEntryRow[];
}

export async function skipPlanSlot(
  userProfileId: string,
  localDate: string,
  mealSlot: Exclude<MealSlot, "unspecified">,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error: fetchError } = await supabase
    .from("meal_plan_entries")
    .select("id")
    .eq("user_profile_id", userProfileId)
    .eq("local_date", localDate)
    .eq("meal_slot", mealSlot)
    .in("status", ["planned", "partial"])
    .maybeSingle();

  if (fetchError) {
    return { ok: false, error: fetchError.message };
  }
  if (!data) {
    return { ok: false, error: `no planned ${mealSlot} on ${localDate}` };
  }

  const { error } = await supabase
    .from("meal_plan_entries")
    .update({ status: "skipped", updated_at: new Date().toISOString() })
    .eq("id", data.id);

  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function swapPlanSlot(
  userProfileId: string,
  localDate: string,
  mealSlot: Exclude<MealSlot, "unspecified">,
  newTitle: string,
): Promise<{ ok: true; entryId: string } | { ok: false; error: string }> {
  const { data, error: fetchError } = await supabase
    .from("meal_plan_entries")
    .select("id, title")
    .eq("user_profile_id", userProfileId)
    .eq("local_date", localDate)
    .eq("meal_slot", mealSlot)
    .in("status", ["planned", "partial"])
    .maybeSingle();

  if (fetchError) {
    return { ok: false, error: fetchError.message };
  }

  const title = newTitle.trim().slice(0, 500);
  if (!title) {
    return { ok: false, error: "new meal title required" };
  }

  if (data) {
    await supabase
      .from("meal_plan_entries")
      .update({ status: "swapped", updated_at: new Date().toISOString() })
      .eq("id", data.id);
  }

  const { data: inserted, error: insertError } = await supabase
    .from("meal_plan_entries")
    .insert({
      user_profile_id: userProfileId,
      local_date: localDate,
      meal_slot: mealSlot,
      title,
      status: "planned",
      source: "chat",
      metadata: data ? { swapped_from: data.title } : {},
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    return { ok: false, error: insertError?.message ?? "insert failed" };
  }

  return { ok: true, entryId: inserted.id as string };
}

/** Exchange two planned slots on the same day (e.g. lunch ↔ dinner). */
export async function switchPlanSlots(
  userProfileId: string,
  localDate: string,
  slotA: Exclude<MealSlot, "unspecified">,
  slotB: Exclude<MealSlot, "unspecified">,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (slotA === slotB) {
    return { ok: false, error: "pick two different meal slots" };
  }

  const entries = await getPlanEntriesForDate(userProfileId, localDate);
  const rowA = entries.find((e) => e.meal_slot === slotA);
  const rowB = entries.find((e) => e.meal_slot === slotB);

  if (!rowA || !rowB) {
    const missing = !rowA ? slotA : slotB;
    return { ok: false, error: `no planned ${missing} on ${localDate}` };
  }

  const now = new Date().toISOString();

  const { error: errA } = await supabase
    .from("meal_plan_entries")
    .update({
      title: rowB.title,
      description: rowB.description,
      updated_at: now,
      metadata: { switched_with: slotB, previous_title: rowA.title },
    })
    .eq("id", rowA.id);

  if (errA) {
    return { ok: false, error: errA.message };
  }

  const { error: errB } = await supabase
    .from("meal_plan_entries")
    .update({
      title: rowA.title,
      description: rowA.description,
      updated_at: now,
      metadata: { switched_with: slotA, previous_title: rowB.title },
    })
    .eq("id", rowB.id);

  if (errB) {
    return { ok: false, error: errB.message };
  }

  return { ok: true };
}

export async function copyPlanWeek(
  userProfileId: string,
  sourceStartDate: string,
  targetStartDate: string,
): Promise<SavePlanResult> {
  const sourceEnd = offsetDateKey(sourceStartDate, 6);
  const sourceEntries = await getPlanEntriesForRange(userProfileId, sourceStartDate, sourceEnd);

  const planned = sourceEntries.filter((e) => e.status === "planned" || e.status === "logged");
  if (!planned.length) {
    return { ok: false, error: "no plan entries in source week" };
  }

  const dayOffset = Math.round(
    (Date.parse(`${targetStartDate}T12:00:00Z`) - Date.parse(`${sourceStartDate}T12:00:00Z`)) /
      (24 * 60 * 60 * 1000),
  );

  const copied: MealPlanEntryInput[] = planned.map((e) => ({
    local_date: offsetDateKey(e.local_date, dayOffset),
    meal_slot: e.meal_slot,
    title: e.title,
    description: e.description,
  }));

  return savePlanEntries(userProfileId, copied, "copied");
}

export function formatPlanDay(entries: MealPlanEntryRow[], label: string, localDate: string): string {
  if (!entries.length) {
    return `No meals planned for **${label}** (${localDate}).`;
  }

  const lines = [`**${label}** (${localDate})`, ""];
  for (const e of entries) {
    const status =
      e.status === "logged" ? " ✓ logged" : e.status === "skipped" ? " (skipped)" : "";
    lines.push(`• **${slotLabel(e.meal_slot)}:** ${e.title}${status}`);
  }
  return lines.join("\n");
}

export function formatPlanWeek(entries: MealPlanEntryRow[], fromDate: string, toDate: string): string {
  if (!entries.length) {
    return `No meal plan saved for ${fromDate} → ${toDate}.`;
  }

  const byDate = new Map<string, MealPlanEntryRow[]>();
  for (const e of entries) {
    const list = byDate.get(e.local_date) ?? [];
    list.push(e);
    byDate.set(e.local_date, list);
  }

  const lines = [`**Meal plan** (${fromDate} → ${toDate})`, ""];
  for (const date of [...byDate.keys()].sort()) {
    lines.push(`**${date}**`);
    for (const e of byDate.get(date)!) {
      const status = e.status === "logged" ? " ✓" : "";
      lines.push(`  • ${slotLabel(e.meal_slot)}: ${e.title}${status}`);
    }
    lines.push("");
  }
  return lines.join("\n").trim();
}

function titlesSimilar(planned: string, logged: string): boolean {
  const a = planned.toLowerCase().replace(/[^a-z0-9\s]/g, " ");
  const b = logged.toLowerCase().replace(/[^a-z0-9\s]/g, " ");
  const aWords = new Set(a.split(/\s+/).filter((w) => w.length > 2));
  const bWords = b.split(/\s+/).filter((w) => w.length > 2);
  if (!aWords.size || !bWords.length) {
    return false;
  }
  let overlap = 0;
  for (const w of bWords) {
    if (aWords.has(w)) {
      overlap += 1;
    }
  }
  return overlap >= 1;
}

/** Link a meal log to today's planned slot when titles clearly match. */
export async function linkPlanEntryOnLog(input: {
  userProfileId: string;
  localDate: string;
  mealSlot: MealSlot;
  mealSessionId: string;
  rawMealText: string;
}): Promise<PlanLinkResult> {
  if (input.mealSlot === "unspecified") {
    return { linked: false, matched: false };
  }

  const { data: plan, error } = await supabase
    .from("meal_plan_entries")
    .select("id, title")
    .eq("user_profile_id", input.userProfileId)
    .eq("local_date", input.localDate)
    .eq("meal_slot", input.mealSlot)
    .eq("status", "planned")
    .maybeSingle();

  if (error || !plan) {
    return { linked: false, matched: false };
  }

  const matched = titlesSimilar(plan.title as string, input.rawMealText);
  if (!matched) {
    return { linked: false, matched: false, planTitle: plan.title as string };
  }

  const now = new Date().toISOString();

  await supabase
    .from("meal_plan_entries")
    .update({
      status: "logged",
      linked_meal_session_id: input.mealSessionId,
      updated_at: now,
    })
    .eq("id", plan.id);

  await supabase
    .from("meal_logs")
    .update({ plan_entry_id: plan.id })
    .eq("meal_session_id", input.mealSessionId)
    .eq("user_profile_id", input.userProfileId);

  return {
    linked: true,
    planTitle: plan.title as string,
    matched: true,
  };
}

export async function fetchPlanAdherenceForDate(
  userProfileId: string,
  localDate: string,
): Promise<{
  slotsPlanned: Exclude<MealSlot, "unspecified">[];
  slotsMissed: Exclude<MealSlot, "unspecified">[];
  adherenceScore: number | null;
}> {
  const { data, error } = await supabase
    .from("meal_plan_entries")
    .select("meal_slot, status")
    .eq("user_profile_id", userProfileId)
    .eq("local_date", localDate)
    .in("status", ["planned", "logged", "partial"]);

  if (error || !data?.length) {
    return { slotsPlanned: [], slotsMissed: [], adherenceScore: null };
  }

  const slotsPlanned: Exclude<MealSlot, "unspecified">[] = [];
  const slotsMissed: Exclude<MealSlot, "unspecified">[] = [];
  let logged = 0;

  for (const row of data) {
    const slot = row.meal_slot as Exclude<MealSlot, "unspecified">;
    slotsPlanned.push(slot);
    if (row.status === "logged") {
      logged += 1;
    } else {
      slotsMissed.push(slot);
    }
  }

  const adherenceScore = slotsPlanned.length > 0 ? logged / slotsPlanned.length : null;
  return { slotsPlanned, slotsMissed, adherenceScore };
}
