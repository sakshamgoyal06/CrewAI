import { timezoneAbbrev } from "../nutrition/localDate.js";
import { estimateMealNutrition } from "./estimateMealNutrition.js";
import { formatMealLogReplyCompact, targetIndicatorsCompact } from "./formatMealLogReply.js";
import { countMealLogSessionsForDay, loadDailyTargets, sumMealLogsForDay } from "./mealDaySummary.js";
import { mealLogComposeHeadline, type MealLogComposeEntry } from "./mealLogCompose.js";
import type { MealComponentForRow } from "./mealComponents.js";
import type { MealLogKind, MealSlot } from "./parseMealLogCommand.js";
import { recordMealSession } from "./recordMealLog.js";
import type { MealNutritionEstimate } from "./types.js";
import { sanitizeMealLogRawText } from "./sanitizeMealLogRawText.js";

/** @internal — covered by `mealLogPipeline.saveFailure.test.ts` */
export function formatMealLogSaveFailure(message: string): string {
  const lower = message.toLowerCase();
  const hint =
    lower.includes("relation") && lower.includes("does not exist")
      ? " Run migration `supabase/migrations/20260412180000_meal_logs.sql` in the Supabase SQL editor (or `supabase db push`)."
      : lower.includes("schema cache") || lower.includes("pgrst205")
        ? " Table may be missing: apply the `meal_logs` migration in Supabase."
        : lower.includes("meal_session_id") || lower.includes("component_index")
          ? " Apply migration `supabase/migrations/20260412210000_meal_session_and_daily_targets.sql` in Supabase."
          : "";
  return `Could not save meal log: ${message}.${hint}`;
}

function sumMealTotals(components: MealComponentForRow[]): {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
} {
  return {
    calories: components.reduce((s, c) => s + (c.calories ?? 0), 0),
    protein_g: components.reduce((s, c) => s + (c.protein_g ?? 0), 0),
    carbs_g: components.reduce((s, c) => s + (c.carbs_g ?? 0), 0),
    fat_g: components.reduce((s, c) => s + (c.fat_g ?? 0), 0),
  };
}

/**
 * Persist a precomputed nutrition estimate (e.g. per-component CalorieNinjas) and return the same * formatted Telegram reply as `completeMealLogFromPipeline`.
 */
export async function completeMealLogWithEstimate(input: {
  userProfileId: string;
  rawMealText: string;
  estimate: MealNutritionEstimate;
  timezone?: string | null;
  mealSlot?: MealSlot;
  logKind?: MealLogKind;
}): Promise<
  | { ok: true; reply: string; mealSessionId: string; compose: MealLogComposeEntry }
  | { ok: false; reply: string }
> {
  try {
    const estimate = input.estimate;
    const saved = await recordMealSession({
      userProfileId: input.userProfileId,
      rawText: sanitizeMealLogRawText(input.rawMealText),
      estimate,
      sourceChannel: "telegram",
      timezone: input.timezone,
      mealSlot: input.mealSlot,
      logKind: input.logKind,
    });

    if (!saved.ok) {
      return { ok: false, reply: formatMealLogSaveFailure(saved.error) };
    }

    const mealTotals = sumMealTotals(saved.components);
    const [day, daySessionCount] = await Promise.all([
      sumMealLogsForDay(input.userProfileId, saved.date),
      countMealLogSessionsForDay(input.userProfileId, saved.date),
    ]);
    const targets = await loadDailyTargets(input.userProfileId);

    const tzLabel = timezoneAbbrev(input.timezone);

    if (estimate.calories === null) {
      const slot = input.mealSlot ?? "unspecified";
      const slotPart =
        slot !== "unspecified"
          ? slot.charAt(0).toUpperCase() + slot.slice(1)
          : "Meal";
      const entryLabel = daySessionCount === 1 ? "entry" : "entries";
      const lines = [
        `**${slotPart} logged** (no calorie estimate).`,
        "",
        `**Today (logged, ${daySessionCount} ${entryLabel}):** ${Math.round(day.calories)} kcal · P ${day.protein_g}g`,
      ];
      const ind = targetIndicatorsCompact(day, targets);
      if (ind) {
        lines.push(ind);
      }
      const compose: MealLogComposeEntry = {
        mealSlot: input.mealSlot ?? "unspecified",
        headline: mealLogComposeHeadline(input.mealSlot ?? "unspecified", input.rawMealText),
        totals: mealTotals,
      };
      return {
        ok: true,
        reply: lines.join("\n"),
        mealSessionId: saved.mealSessionId,
        compose,
      };
    }

    const reply = formatMealLogReplyCompact({
      mealSessionId: saved.mealSessionId,
      loggedDate: saved.date,
      timezoneLabel: tzLabel,
      mealSlot: input.mealSlot ?? "unspecified",
      planLink: saved.planLink,
      rawText: input.rawMealText,
      estimate,
      components: saved.components,
      mealTotals,
      day,
      daySessionCount,
      targets,
    });

    const compose: MealLogComposeEntry = {
      mealSlot: input.mealSlot ?? "unspecified",
      headline: mealLogComposeHeadline(input.mealSlot ?? "unspecified", input.rawMealText),
      totals: mealTotals,
    };
    return { ok: true, reply, mealSessionId: saved.mealSessionId, compose };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, reply: `Meal log failed: ${msg}` };
  }
}

/**
 * Estimate + persist + formatted reply. `nutritionQuery` may differ from `rawMealText`
 * (e.g. after the Nutrition agent normalizes wording for CalorieNinjas).
 */
export async function completeMealLogFromPipeline(input: {
  userProfileId: string;
  rawMealText: string;
  nutritionQuery: string;
  timezone?: string | null;
  mealSlot?: MealSlot;
  logKind?: MealLogKind;
}): Promise<
  | { ok: true; reply: string; mealSessionId: string; compose: MealLogComposeEntry }
  | { ok: false; reply: string }
> {
  try {
    const estimate = await estimateMealNutrition(input.nutritionQuery.trim());
    return completeMealLogWithEstimate({
      userProfileId: input.userProfileId,
      rawMealText: input.rawMealText,
      estimate,
      timezone: input.timezone,
      mealSlot: input.mealSlot,
      logKind: input.logKind,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, reply: `Meal log failed: ${msg}` };
  }
}
