/**
 * Import past meals from a MyFitnessPal export, so switching to Magnus doesn't start from zero.
 *
 * MyFitnessPal's export (Settings → Export data) is a zip whose "Nutrition-Summary-….csv" has one
 * row per day and meal: Date, Meal, Calories, Fat (g), …, Carbohydrates (g), …, Protein (g). The
 * app unzips it in the browser and sends the CSV text here.
 *
 * Each imported meal becomes one meal_logs row ("Lunch (MyFitnessPal)") with a meal_session_id
 * derived from the person, date and meal, so importing the same file twice adds nothing. Days the
 * person already logged in Magnus are left alone, so a day is never counted twice.
 */
import { z } from "zod";

import { localDateKey } from "../nutrition/localDate.js";
import { supabase } from "../tools/clients.js";
import { stableTurnId } from "../util/stableId.js";
import type { AppMealSlot } from "./meals.js";

/** Marks imported meals in raw_text; frequent-meal suggestions skip these. */
export const MFP_RAW_TEXT = "Imported from MyFitnessPal";
/** How far back an import reaches. */
export const MFP_MAX_DAYS = 365;
const MAX_ROWS = 4000;

export const mfpImportInput = z.object({
  csv: z.string().min(10).max(1_500_000),
  /** True: report what would be imported and write nothing. */
  dryRun: z.boolean().optional(),
});

export type MfpMeal = {
  date: string;
  slot: Exclude<AppMealSlot, "unspecified">;
  label: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

/** Splits CSV text into rows of fields (quotes, escaped quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows;
}

/** YYYY-MM-DD from "2026-10-31" or US-style "10/31/2026"; null otherwise. */
export function mfpDate(raw: string): string | null {
  const v = raw.trim();
  let y: number, m: number, d: number;
  let hit = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(v);
  if (hit) [y, m, d] = [Number(hit[1]), Number(hit[2]), Number(hit[3])];
  else if ((hit = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(v))) [y, m, d] = [Number(hit[3]), Number(hit[1]), Number(hit[2])];
  else return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

function mfpSlot(raw: string): MfpMeal["slot"] {
  const v = raw.trim().toLowerCase();
  if (v.startsWith("breakfast")) return "breakfast";
  if (v.startsWith("lunch")) return "lunch";
  if (v.startsWith("dinner")) return "dinner";
  return "snack";
}

const num = (v: string | undefined): number => {
  const n = Number(String(v ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const r1 = (n: number) => Math.round(n * 10) / 10;

export type ParsedMfp = { ok: true; meals: MfpMeal[] } | { ok: false; error: "not_mfp_summary" | "too_many_rows" };

/**
 * Meals from a Nutrition Summary CSV, one per date and meal name (rows for the same pair are
 * added up). Rows without calories, with bad dates, or outside [from, to] are skipped.
 */
export function parseMfpNutritionSummary(csv: string, range: { from: string; to: string }): ParsedMfp {
  const rows = parseCsv(csv);
  const header = (rows[0] ?? []).map((h) => h.trim().toLowerCase());
  const col = (re: RegExp) => header.findIndex((h) => re.test(h));
  const at = { date: col(/^date$/), meal: col(/^meal$/), kcal: col(/^calories/), fat: col(/^fat\b/), carbs: col(/^carbohydrates/), protein: col(/^protein/) };
  if (at.date < 0 || at.meal < 0 || at.kcal < 0) return { ok: false, error: "not_mfp_summary" };
  if (rows.length - 1 > MAX_ROWS) return { ok: false, error: "too_many_rows" };

  const byKey = new Map<string, MfpMeal>();
  for (const r of rows.slice(1)) {
    const date = mfpDate(r[at.date] ?? "");
    const calories = num(r[at.kcal]);
    if (!date || date < range.from || date > range.to || calories <= 0) continue;
    const label = (r[at.meal] ?? "").trim().slice(0, 40) || "Snacks";
    const key = `${date}|${label.toLowerCase()}`;
    const m = byKey.get(key) ?? { date, slot: mfpSlot(label), label, calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
    m.calories += calories;
    m.protein_g += at.protein >= 0 ? num(r[at.protein]) : 0;
    m.carbs_g += at.carbs >= 0 ? num(r[at.carbs]) : 0;
    m.fat_g += at.fat >= 0 ? num(r[at.fat]) : 0;
    byKey.set(key, m);
  }
  const meals = [...byKey.values()]
    .map((m) => ({ ...m, calories: Math.round(m.calories), protein_g: r1(m.protein_g), carbs_g: r1(m.carbs_g), fat_g: r1(m.fat_g) }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.label.localeCompare(b.label));
  return { ok: true, meals };
}

/** A stable UUID for one imported meal, so a second import of the same file is a no-op. */
export function mfpSessionId(userProfileId: string, date: string, label: string): string {
  return stableTurnId(`mfp|${userProfileId}|${date}|${label.toLowerCase()}`);
}

export type MfpImportResult =
  | {
      ok: true;
      dryRun: boolean;
      /** Days and meals added (or that would be). */
      days: number;
      meals: number;
      /** Days left alone because the person already logged meals in Magnus. */
      skippedLoggedDays: number;
      /** Meals that an earlier import already added. */
      alreadyImported: number;
      from: string | null;
      to: string | null;
      avgCalories: number | null;
    }
  | { ok: false; error: string };

function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function importMfp(
  userProfileId: string,
  input: z.infer<typeof mfpImportInput>,
  timezone: string,
  now = new Date(),
): Promise<MfpImportResult> {
  const today = localDateKey(now, timezone);
  const parsed = parseMfpNutritionSummary(input.csv, { from: shiftDate(today, -MFP_MAX_DAYS), to: today });
  if (!parsed.ok) return parsed;
  if (!parsed.meals.length) return { ok: false, error: "no_meals" };

  const first = parsed.meals[0]!.date;
  const last = parsed.meals[parsed.meals.length - 1]!.date;
  const { data, error } = await supabase
    .from("meal_logs")
    .select("local_date, meal_session_id, raw_text")
    .eq("user_profile_id", userProfileId)
    .is("deleted_at", null)
    .gte("local_date", first)
    .lte("local_date", last)
    .limit(20_000);
  if (error) return { ok: false, error: error.message };
  const loggedDays = new Set<string>();
  const importedIds = new Set<string>();
  for (const r of (data ?? []) as Array<{ local_date: string; meal_session_id: string; raw_text: string | null }>) {
    if (r.raw_text === MFP_RAW_TEXT) importedIds.add(String(r.meal_session_id));
    else loggedDays.add(String(r.local_date));
  }

  const toAdd: Array<MfpMeal & { id: string }> = [];
  const skippedDays = new Set<string>();
  let alreadyImported = 0;
  for (const m of parsed.meals) {
    if (loggedDays.has(m.date)) { skippedDays.add(m.date); continue; }
    const id = mfpSessionId(userProfileId, m.date, m.label);
    if (importedIds.has(id)) { alreadyImported += 1; continue; }
    toAdd.push({ ...m, id });
  }

  const days = new Set(toAdd.map((m) => m.date));
  const dayKcal = new Map<string, number>();
  for (const m of toAdd) dayKcal.set(m.date, (dayKcal.get(m.date) ?? 0) + m.calories);
  const result = {
    ok: true as const,
    dryRun: Boolean(input.dryRun),
    days: days.size,
    meals: toAdd.length,
    skippedLoggedDays: skippedDays.size,
    alreadyImported,
    from: toAdd[0]?.date ?? null,
    to: toAdd[toAdd.length - 1]?.date ?? null,
    avgCalories: dayKcal.size ? Math.round([...dayKcal.values()].reduce((a, b) => a + b, 0) / dayKcal.size) : null,
  };
  if (input.dryRun || !toAdd.length) return result;

  const loggedAt = now.toISOString();
  const rows = toAdd.map((m) => {
    const item = { name: `${m.label} (MyFitnessPal)`, calories: m.calories, protein_g: m.protein_g, carbs_g: m.carbs_g, fat_g: m.fat_g };
    return {
      user_profile_id: userProfileId,
      date: m.date,
      local_date: m.date,
      meal_time: m.slot,
      meal_slot: m.slot,
      log_kind: m.slot === "snack" ? "snack" : "meal",
      description: item.name,
      raw_text: MFP_RAW_TEXT,
      macros: { protein_g: m.protein_g, carbs_g: m.carbs_g, fat_g: m.fat_g, estimate_source: "unavailable" },
      calories: m.calories,
      protein_g: m.protein_g,
      carbs_g: m.carbs_g,
      fat_g: m.fat_g,
      // The numbers are the person's own MyFitnessPal log, not a Magnus estimate; the column's
      // allowed values have no "imported", and provider_raw says where they came from.
      estimate_source: "unavailable",
      items: [item],
      provider_raw: { imported_from: "myfitnesspal", meal: m.label },
      source_channel: "api",
      meal_session_id: m.id,
      component_index: 0,
      logged_at: loggedAt,
    };
  });
  for (let i = 0; i < rows.length; i += 500) {
    const { error: insertError } = await supabase.from("meal_logs").insert(rows.slice(i, i + 500));
    if (insertError) return { ok: false, error: insertError.message };
  }
  return result;
}
