import { randomUUID } from "node:crypto";

import { logger } from "../logger.js";
import { localDateKey } from "../nutrition/localDate.js";
import { linkPlanEntryOnLog } from "../nutrition/store/mealPlanStore.js";
import { recomputeDailyRollup } from "../nutrition/store/mealRollupStore.js";
import { getRecentSessions } from "../nutrition/store/mealHistoryStore.js";
import { findDuplicateSession } from "./mealSessionSimilarity.js";
import { supabase } from "../tools/clients.js";
import { buildMealComponentsFromEstimate, type MealComponentForRow } from "./mealComponents.js";
import { consolidateMealNutritionEstimate } from "./mealItemConsolidate.js";
import type { MealLogKind, MealSlot } from "./parseMealLogCommand.js";
import type { MealNutritionEstimate } from "./types.js";

export type RecordMealSessionInput = {
  userProfileId: string;
  rawText: string;
  estimate: MealNutritionEstimate;
  sourceChannel?: "telegram" | "api" | "system";
  timezone?: string | null;
  mealSlot?: MealSlot;
  logKind?: MealLogKind;
};

export type RecordMealSessionResult =
  | {
      ok: true;
      mealSessionId: string;
      rowIds: string[];
      loggedAt: string;
      date: string;
      components: MealComponentForRow[];
      planLink?: {
        linked: boolean;
        planTitle?: string;
        matched: boolean;
      };
      duplicateSkipped?: boolean;
    }
  | { ok: false; error: string };

/** @deprecated Use `RecordMealSessionResult` */
export type RecordMealLogResult = RecordMealSessionResult;

/** Ensure JSONB columns only get JSON-serializable data (avoids PostgREST edge cases). */
function jsonbSafe(value: unknown): unknown {
  if (value === null || value === undefined) {
    return null;
  }
  try {
    return JSON.parse(JSON.stringify(value)) as unknown;
  } catch {
    return { _serialization: "failed" };
  }
}

function legacyUtcDateString(instant: Date): string {
  return instant.toISOString().slice(0, 10);
}

/** Legacy `meal_logs.calories` is often integer; views may depend on that type. */
function caloriesForDb(calories: number | null | undefined): number | null {
  if (calories === null || calories === undefined) {
    return null;
  }
  return Math.round(calories);
}

/**
 * Inserts one `meal_logs` row per component, sharing `meal_session_id` and `logged_at`.
 */
export async function recordMealSession(input: RecordMealSessionInput): Promise<RecordMealSessionResult> {
  const loggedAtInstant = new Date();
  const localDate = localDateKey(loggedAtInstant, input.timezone);

  const recent = await getRecentSessions(input.userProfileId, 8);
  const duplicate = findDuplicateSession(input.rawText, recent, {
    sameSlotOnly: true,
    mealSlot: input.mealSlot,
  });
  if (duplicate) {
    logger.info(
      { mealSessionId: duplicate.mealSessionId, rawText: input.rawText.slice(0, 80) },
      "meal_log duplicate skipped",
    );
    return {
      ok: true,
      mealSessionId: duplicate.mealSessionId,
      rowIds: [],
      loggedAt: duplicate.loggedAt,
      date: duplicate.localDate,
      components: [],
      duplicateSkipped: true,
    };
  }

  const mealSessionId = randomUUID();
  const legacyDate = legacyUtcDateString(loggedAtInstant);
  const loggedAt = loggedAtInstant.toISOString();
  const mealSlot = input.mealSlot ?? "unspecified";
  const logKind = input.logKind ?? (mealSlot === "snack" ? "snack" : "meal");
  const estimate = consolidateMealNutritionEstimate(input.estimate);
  const components = buildMealComponentsFromEstimate(estimate, input.rawText);

  const rows = components.map((c) => {
    const macros = {
      protein_g: c.protein_g,
      carbs_g: c.carbs_g,
      fat_g: c.fat_g,
      estimate_source: estimate.source,
    };
    return {
      user_profile_id: input.userProfileId,
      date: legacyDate,
      local_date: localDate,
      meal_time: mealSlot === "unspecified" ? "unspecified" : mealSlot,
      meal_slot: mealSlot,
      log_kind: logKind,
      description: c.label.slice(0, 2000),
      raw_text: input.rawText,
      macros: jsonbSafe(macros),
      calories: caloriesForDb(c.calories),
      protein_g: c.protein_g,
      carbs_g: c.carbs_g,
      fat_g: c.fat_g,
      estimate_source: estimate.source,
      items: jsonbSafe(c.itemsSnapshot.length ? c.itemsSnapshot : [{ name: c.label }]) ?? [],
      provider_raw: c.componentIndex === 0 ? jsonbSafe(estimate.providerRaw) : null,
      source_channel: input.sourceChannel ?? "telegram",
      meal_session_id: mealSessionId,
      component_index: c.componentIndex,
      logged_at: loggedAt,
    };
  });

  const { data, error } = await supabase.from("meal_logs").insert(rows).select("id");

  if (error) {
    logger.warn(
      {
        code: error.code,
        details: error.details,
        hint: error.hint,
        message: error.message,
      },
      "meal_logs insert failed",
    );
    return { ok: false, error: error.message };
  }

  const rowIds = (data ?? []).map((r) => r.id as string).filter(Boolean);
  if (rowIds.length !== rows.length) {
    return { ok: false, error: "insert count mismatch" };
  }

  await recomputeDailyRollup(input.userProfileId, localDate);

  const planLink = await linkPlanEntryOnLog({
    userProfileId: input.userProfileId,
    localDate,
    mealSlot,
    mealSessionId,
    rawMealText: input.rawText,
  });

  return {
    ok: true,
    mealSessionId,
    rowIds,
    loggedAt,
    date: localDate,
    components,
    planLink,
  };
}

/** Alias for `recordMealSession` (same behavior: multi-row per meal). */
export const recordMealLog = recordMealSession;
