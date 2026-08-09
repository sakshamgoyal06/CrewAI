/**
 * Daily nutrition rollups — recomputed from meal_logs after each write/delete.
 */
import { logger } from "../../logger.js";
import { loadDailyTargets } from "../../meals/mealDaySummary.js";
import { supabase } from "../../tools/clients.js";
import { loggableError } from "../../util/loggableError.js";
import type { MealSlot } from "../types.js";
import { fetchPlanAdherenceForDate } from "./mealPlanStore.js";

function num(v: unknown): number {
  if (v === null || v === undefined) {
    return 0;
  }
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function isMealSlot(v: unknown): v is MealSlot {
  return (
    v === "breakfast" ||
    v === "lunch" ||
    v === "dinner" ||
    v === "snack" ||
    v === "unspecified"
  );
}

export type RecomputeRollupResult = { ok: true } | { ok: false; error: string };

/**
 * Re-aggregate `meal_logs` for one user local date and upsert `meal_daily_rollups`.
 * No-op (ok) when rollup table or local_date column is unavailable.
 */
export async function recomputeDailyRollup(
  userProfileId: string,
  localDate: string,
): Promise<RecomputeRollupResult> {
  const { data: rows, error: selectError } = await supabase
    .from("meal_logs")
    .select("calories, protein_g, carbs_g, fat_g, meal_slot, log_kind")
    .eq("user_profile_id", userProfileId)
    .eq("local_date", localDate)
    .is("deleted_at", null);

  if (selectError) {
    const msg = selectError.message ?? String(selectError);
    if (
      msg.includes("local_date") ||
      msg.includes("deleted_at") ||
      msg.includes("schema cache") ||
      msg.includes("does not exist")
    ) {
      return { ok: true };
    }
    logger.warn({ err: loggableError(selectError), userProfileId, localDate }, "meal rollup select failed");
    return { ok: false, error: msg };
  }

  let calories = 0;
  let protein_g = 0;
  let carbs_g = 0;
  let fat_g = 0;
  let mealCount = 0;
  let snackCount = 0;
  const slotsLogged = new Set<MealSlot>();

  for (const row of rows ?? []) {
    calories += num(row.calories);
    protein_g += num(row.protein_g);
    carbs_g += num(row.carbs_g);
    fat_g += num(row.fat_g);

    const kind = row.log_kind as string | undefined;
    if (kind === "snack") {
      snackCount += 1;
    } else {
      mealCount += 1;
    }

    const slot = row.meal_slot;
    if (isMealSlot(slot) && slot !== "unspecified") {
      slotsLogged.add(slot);
    }
  }

  const targets = await loadDailyTargets(userProfileId);
  const planStats = await fetchPlanAdherenceForDate(userProfileId, localDate);
  const flags: string[] = [];
  if (targets?.daily_protein_g_target && protein_g < targets.daily_protein_g_target * 0.7) {
    flags.push("protein_low");
  }
  if (targets?.daily_calorie_target && calories > targets.daily_calorie_target * 1.3) {
    flags.push("calorie_spike");
  }
  if (planStats.adherenceScore !== null && planStats.adherenceScore < 0.5 && planStats.slotsPlanned.length >= 2) {
    flags.push("plan_drift");
  }

  const payload = {
    user_profile_id: userProfileId,
    local_date: localDate,
    calories: Math.round(calories),
    protein_g: Math.round(protein_g * 10) / 10,
    carbs_g: Math.round(carbs_g * 10) / 10,
    fat_g: Math.round(fat_g * 10) / 10,
    meal_count: mealCount,
    snack_count: snackCount,
    slots_logged: [...slotsLogged],
    slots_planned: planStats.slotsPlanned,
    slots_missed: planStats.slotsMissed,
    adherence_score: planStats.adherenceScore,
    target_calories: targets?.daily_calorie_target ?? null,
    target_protein_g: targets?.daily_protein_g_target ?? null,
    flags,
    updated_at: new Date().toISOString(),
  };

  const { error: upsertError } = await supabase.from("meal_daily_rollups").upsert(payload, {
    onConflict: "user_profile_id,local_date",
  });

  if (upsertError) {
    const msg = upsertError.message ?? String(upsertError);
    if (msg.includes("meal_daily_rollups") || msg.includes("schema cache") || msg.includes("does not exist")) {
      return { ok: true };
    }
    logger.warn({ err: loggableError(upsertError), userProfileId, localDate }, "meal rollup upsert failed");
    return { ok: false, error: msg };
  }

  return { ok: true };
}
