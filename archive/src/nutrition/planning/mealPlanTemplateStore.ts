/**
 * Save and apply reusable meal plan templates.
 */
import { logger } from "../../logger.js";
import { supabase } from "../../tools/clients.js";
import { loggableError } from "../../util/loggableError.js";
import { offsetDateKey } from "../parseMealPlanJson.js";
import type { MealPlanEntryInput } from "../parseMealPlanJson.js";
import { getPlanEntriesForRange, savePlanEntries } from "../store/mealPlanStore.js";
import type { MealSlot } from "../types.js";

export type TemplateEntry = {
  day_offset: number;
  meal_slot: Exclude<MealSlot, "unspecified">;
  title: string;
  description?: string | null;
};

export type MealPlanTemplateRow = {
  id: string;
  user_profile_id: string;
  name: string;
  description: string | null;
  day_count: number;
  slots: string[];
  entries: TemplateEntry[];
  created_at: string;
  updated_at: string;
};

function isTemplateEntry(raw: unknown): raw is TemplateEntry {
  if (!raw || typeof raw !== "object") {
    return false;
  }
  const o = raw as TemplateEntry;
  return (
    typeof o.day_offset === "number" &&
    typeof o.meal_slot === "string" &&
    typeof o.title === "string"
  );
}

function normalizeTemplateEntries(raw: unknown): TemplateEntry[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter(isTemplateEntry);
}

export async function listMealPlanTemplates(
  userProfileId: string,
): Promise<MealPlanTemplateRow[]> {
  const { data, error } = await supabase
    .from("meal_plan_templates")
    .select("*")
    .eq("user_profile_id", userProfileId)
    .order("updated_at", { ascending: false })
    .limit(20);

  if (error) {
    logger.warn({ err: loggableError(error) }, "meal plan templates list failed");
    return [];
  }

  return (data ?? []).map((row) => ({
    ...(row as MealPlanTemplateRow),
    entries: normalizeTemplateEntries(row.entries),
  }));
}

export async function saveTemplateFromRange(input: {
  userProfileId: string;
  name: string;
  fromDate: string;
  toDate: string;
  description?: string | null;
}): Promise<{ ok: true; templateId: string; entryCount: number } | { ok: false; error: string }> {
  const entries = await getPlanEntriesForRange(input.userProfileId, input.fromDate, input.toDate);
  if (!entries.length) {
    return { ok: false, error: "no plan entries in that date range" };
  }

  const templateEntries: TemplateEntry[] = [];
  const slots = new Set<string>();

  for (const row of entries) {
    if (row.status === "skipped") {
      continue;
    }
    const dayOffset = daysBetween(input.fromDate, row.local_date);
    if (dayOffset < 0) {
      continue;
    }
    slots.add(row.meal_slot);
    templateEntries.push({
      day_offset: dayOffset,
      meal_slot: row.meal_slot,
      title: row.title,
      description: row.description,
    });
  }

  if (!templateEntries.length) {
    return { ok: false, error: "no active plan entries to save as template" };
  }

  const dayCount = daysBetween(input.fromDate, input.toDate) + 1;

  const name = input.name.trim().slice(0, 120);
  const payload = {
    user_profile_id: input.userProfileId,
    name,
    description: input.description?.trim().slice(0, 500) ?? null,
    day_count: dayCount,
    slots: [...slots],
    entries: templateEntries,
    updated_at: new Date().toISOString(),
  };

  const { data: existing } = await supabase
    .from("meal_plan_templates")
    .select("id")
    .eq("user_profile_id", input.userProfileId)
    .ilike("name", name)
    .maybeSingle();

  const { data, error } = existing?.id
    ? await supabase
        .from("meal_plan_templates")
        .update(payload)
        .eq("id", existing.id)
        .select("id")
        .single()
    : await supabase.from("meal_plan_templates").insert(payload).select("id").single();

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, templateId: data.id as string, entryCount: templateEntries.length };
}

export async function applyMealPlanTemplate(input: {
  userProfileId: string;
  templateName: string;
  startDate: string;
}): Promise<{ ok: true; savedCount: number; dates: string[] } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from("meal_plan_templates")
    .select("*")
    .eq("user_profile_id", input.userProfileId)
    .ilike("name", input.templateName.trim())
    .maybeSingle();

  if (error || !data) {
    return { ok: false, error: `template "${input.templateName}" not found` };
  }

  const templateEntries = normalizeTemplateEntries(data.entries);
  if (!templateEntries.length) {
    return { ok: false, error: "template has no entries" };
  }

  const planEntries: MealPlanEntryInput[] = templateEntries.map((e) => ({
    local_date: offsetDateKey(input.startDate, e.day_offset),
    meal_slot: e.meal_slot,
    title: e.title,
    description: e.description ?? null,
  }));

  const saved = await savePlanEntries(input.userProfileId, planEntries, "template");
  if (!saved.ok) {
    return saved;
  }

  return saved;
}

function daysBetween(fromDate: string, toDate: string): number {
  const [y1, m1, d1] = fromDate.split("-").map((x) => Number.parseInt(x, 10));
  const [y2, m2, d2] = toDate.split("-").map((x) => Number.parseInt(x, 10));
  const a = Date.UTC(y1!, m1! - 1, d1!);
  const b = Date.UTC(y2!, m2! - 1, d2!);
  return Math.round((b - a) / (24 * 60 * 60 * 1000));
}

export function formatTemplateList(templates: MealPlanTemplateRow[]): string {
  if (!templates.length) {
    return "No saved meal plan templates yet. Say **save this week as template high-protein** after locking a plan.";
  }
  const lines = templates.map(
    (t) => `- **${t.name}** (${t.day_count} day(s), ${t.entries.length} meals)`,
  );
  return `Saved templates:\n${lines.join("\n")}`;
}
