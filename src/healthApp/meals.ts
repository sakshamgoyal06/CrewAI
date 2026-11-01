/**
 * Meal logging for the health app: estimate → draft the user can edit → confirmed save.
 *
 * What gets saved is exactly the confirmed items (no re-estimation or merging after confirm), so
 * the day's totals always match what the user saw. The draft id doubles as `meal_session_id`, so
 * re-sending a confirm (double tap, retry after a timeout) never logs the meal twice.
 */
import { randomUUID } from "node:crypto";

import { getLocalTimeParts } from "../jobs/morningBriefTime.js";
import { estimateMealNutrition } from "../meals/estimateMealNutrition.js";
import type { MealNutritionEstimate } from "../meals/types.js";
import { resolveTimezone } from "../nutrition/localDate.js";
import {
  getSessionsForLocalDate,
  softDeleteMealSession,
  type MealSessionSummary,
} from "../nutrition/store/mealHistoryStore.js";
import { recomputeDailyRollup } from "../nutrition/store/mealRollupStore.js";
import { supabase } from "../tools/clients.js";

export const MEAL_SLOTS = ["breakfast", "lunch", "dinner", "snack", "unspecified"] as const;
export type AppMealSlot = (typeof MEAL_SLOTS)[number];

export const ESTIMATE_SOURCES = [
  "web_research",
  "healthifyme_proxy",
  "calorieninjas",
  "usda_fdc",
  "llm_estimate",
  "unavailable",
] as const;
export type EstimateSource = (typeof ESTIMATE_SOURCES)[number];

export type MealItem = {
  name: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

export type MealTotals = Omit<MealItem, "name">;

export type MealDraft = {
  draftId: string;
  text: string;
  slot: AppMealSlot;
  source: EstimateSource;
  items: MealItem[];
  totals: MealTotals;
  /** False when no provider returned calories; the user must fill items in before saving. */
  estimated: boolean;
  servingAssumption: string | null;
};

const r1 = (n: number): number => Math.round(n * 10) / 10;

function nonNeg(v: unknown): number | null {
  if (v === null || v === undefined) {
    return null;
  }
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function sumItems(items: MealItem[]): MealTotals {
  return {
    calories: Math.round(items.reduce((s, i) => s + i.calories, 0)),
    protein_g: r1(items.reduce((s, i) => s + i.protein_g, 0)),
    carbs_g: r1(items.reduce((s, i) => s + i.carbs_g, 0)),
    fat_g: r1(items.reduce((s, i) => s + i.fat_g, 0)),
  };
}

/**
 * Turns a provider estimate into editable line items whose sum is the meal total.
 * Uses the provider's lines when every line has calories; otherwise one line for the whole meal.
 */
export function estimateToItems(estimate: MealNutritionEstimate, text: string): MealItem[] {
  const lines = estimate.items ?? [];
  if (lines.length > 0 && lines.every((l) => nonNeg(l.calories) !== null)) {
    return lines.map((l) => ({
      name: (l.name ?? "").trim() || text,
      calories: Math.round(nonNeg(l.calories)!),
      protein_g: r1(nonNeg(l.protein_g) ?? 0),
      carbs_g: r1(nonNeg(l.carbs_g) ?? 0),
      fat_g: r1(nonNeg(l.fat_g) ?? 0),
    }));
  }
  const kcal = nonNeg(estimate.calories);
  if (kcal === null) {
    return [];
  }
  return [
    {
      name: text,
      calories: Math.round(kcal),
      protein_g: r1(nonNeg(estimate.protein_g) ?? 0),
      carbs_g: r1(nonNeg(estimate.carbs_g) ?? 0),
      fat_g: r1(nonNeg(estimate.fat_g) ?? 0),
    },
  ];
}

/** Meal slot from the local clock when the user didn't name one. */
export function slotForLocalHour(hour: number): Exclude<AppMealSlot, "unspecified"> {
  if (hour >= 4 && hour < 11) return "breakfast";
  if (hour >= 11 && hour < 16) return "lunch";
  if (hour >= 16 && hour < 18) return "snack";
  if (hour >= 18 && hour < 23) return "dinner";
  return "snack";
}

export async function draftMeal(input: {
  text: string;
  slot?: AppMealSlot;
  timezone: string;
  now?: Date;
  estimate?: (text: string) => Promise<MealNutritionEstimate>;
}): Promise<MealDraft> {
  const text = input.text.trim();
  const estimate = await (input.estimate ?? estimateMealNutrition)(text);
  const items = estimateToItems(estimate, text);
  const slot =
    input.slot && input.slot !== "unspecified"
      ? input.slot
      : slotForLocalHour(getLocalTimeParts(input.now ?? new Date(), resolveTimezone(input.timezone)).hour);
  return {
    draftId: randomUUID(),
    text,
    slot,
    source: estimate.source,
    items,
    totals: sumItems(items),
    estimated: items.length > 0,
    servingAssumption: estimate.serving_assumption ?? null,
  };
}

export type ConfirmMealInput = {
  draftId: string;
  text: string;
  slot: AppMealSlot;
  source: EstimateSource;
  items: MealItem[];
  /** True when the user changed any number or line in the draft. */
  edited: boolean;
  /** YYYY-MM-DD the meal belongs to; defaults to today in the user's timezone. */
  localDate: string;
};

export type ConfirmMealResult =
  | { ok: true; mealSessionId: string; localDate: string; totals: MealTotals; alreadySaved: boolean }
  | { ok: false; error: string };

export async function saveConfirmedMeal(
  userProfileId: string,
  input: ConfirmMealInput,
  now = new Date(),
): Promise<ConfirmMealResult> {
  if (input.items.length === 0) {
    return { ok: false, error: "no_items" };
  }
  const totals = sumItems(input.items);

  const existing = await supabase
    .from("meal_logs")
    .select("id")
    .eq("user_profile_id", userProfileId)
    .eq("meal_session_id", input.draftId)
    .limit(1);
  if (existing.error) {
    return { ok: false, error: existing.error.message };
  }
  if (existing.data && existing.data.length > 0) {
    return {
      ok: true,
      mealSessionId: input.draftId,
      localDate: input.localDate,
      totals,
      alreadySaved: true,
    };
  }

  const loggedAt = now.toISOString();
  const logKind = input.slot === "snack" ? "snack" : "meal";
  const rows = input.items.map((item, idx) => ({
    user_profile_id: userProfileId,
    date: input.localDate,
    local_date: input.localDate,
    meal_time: input.slot,
    meal_slot: input.slot,
    log_kind: logKind,
    description: item.name.slice(0, 2000),
    raw_text: input.text,
    macros: {
      protein_g: item.protein_g,
      carbs_g: item.carbs_g,
      fat_g: item.fat_g,
      estimate_source: input.source,
    },
    calories: Math.round(item.calories),
    protein_g: item.protein_g,
    carbs_g: item.carbs_g,
    fat_g: item.fat_g,
    estimate_source: input.source,
    items: [item],
    provider_raw: idx === 0 ? { app_confirmed: true, user_edited: input.edited } : null,
    source_channel: "api",
    meal_session_id: input.draftId,
    component_index: idx,
    logged_at: loggedAt,
  }));

  const { error } = await supabase.from("meal_logs").insert(rows);
  if (error) {
    return { ok: false, error: error.message };
  }
  await recomputeDailyRollup(userProfileId, input.localDate);
  return {
    ok: true,
    mealSessionId: input.draftId,
    localDate: input.localDate,
    totals,
    alreadySaved: false,
  };
}

export async function listMealsForDate(
  userProfileId: string,
  localDate: string,
): Promise<MealSessionSummary[]> {
  return getSessionsForLocalDate(userProfileId, localDate);
}

export async function deleteMeal(
  userProfileId: string,
  mealSessionId: string,
  timezone: string,
): Promise<{ ok: true; localDate: string } | { ok: false; error: string }> {
  return softDeleteMealSession(userProfileId, mealSessionId, timezone);
}
