/**
 * Day-close carry-overs: a day outside the 85–105% band moves a little of its miss onto the next
 * days' planned meals (adjust.ts closeDay decides how much). Each adjustment row is applied to a
 * planned meal once (metadata.carry_from lists the days already applied), so a meal planned later,
 * or re-planned after a rebuild, picks it up too.
 */
import { logger } from "../../logger.js";
import { supabase } from "../../tools/clients.js";
import { loggableError } from "../../util/loggableError.js";
import { resizeMeal } from "./adjust.js";
import { sumTotals, type MealOption, type PlanItem, type Totals } from "./compose.js";
import type { MealBudget, PlanSlot } from "./targets.js";

export type CarryMeal = { slot: PlanSlot; items: PlanItem[]; totals: Totals };

/** Spreads `delta` kcal over a day's planned meals in proportion to their size. Pure. */
export function spreadCarry(meals: CarryMeal[], delta: number, budgets: MealBudget[]): CarryMeal[] {
  const total = meals.reduce((a, m) => a + m.totals.kcal, 0);
  if (!total || !delta) return meals;
  return meals.map((m) => {
    const budget = budgets.find((b) => b.slot === m.slot);
    if (!budget || !m.items.length) return m;
    const option: MealOption = { id: "carry", slot: m.slot, title: "", items: m.items, totals: m.totals, origin: "catalog", prepMinutes: 0 };
    const r = resizeMeal(option, m.totals.kcal + (delta * m.totals.kcal) / total, budget);
    return { slot: m.slot, items: r.items, totals: r.totals };
  });
}

type Row = { id: string; local_date: string; meal_slot: PlanSlot; metadata: Record<string, unknown> | null };

export async function saveCarry(userProfileId: string, sourceDate: string, carry: Array<{ date: string; kcalDelta: number }>): Promise<void> {
  if (!carry.length) return;
  const { error } = await supabase.from("health_diet_adjustments").upsert(
    carry.map((c) => ({ user_profile_id: userProfileId, local_date: c.date, kcal_delta: c.kcalDelta, source_date: sourceDate, reason: "day_close" })),
    { onConflict: "user_profile_id,local_date,source_date", ignoreDuplicates: true },
  );
  if (error) throw new Error(error.message);
}

/**
 * Applies every carry-over for `from`..`to` that a planned meal hasn't taken yet. Returns true
 * when it changed a meal, so the caller re-reads them.
 */
export async function applyCarries(userProfileId: string, budgets: MealBudget[], from: string, to: string): Promise<boolean> {
  const { data: adj, error } = await supabase
    .from("health_diet_adjustments")
    .select("local_date, kcal_delta, source_date")
    .eq("user_profile_id", userProfileId)
    .gte("local_date", from)
    .lte("local_date", to);
  if (error) {
    logger.warn({ err: loggableError(error) }, "carry lookup failed");
    return false;
  }
  if (!adj?.length) return false;
  const { data: rows, error: e2 } = await supabase
    .from("meal_plan_entries")
    .select("id, local_date, meal_slot, metadata")
    .eq("user_profile_id", userProfileId)
    .eq("source", "plan")
    .eq("status", "planned")
    .gte("local_date", from)
    .lte("local_date", to);
  if (e2) throw new Error(e2.message);

  let changed = false;
  const byDate = new Map<string, Row[]>();
  for (const r of (rows ?? []) as Row[]) byDate.set(r.local_date, [...(byDate.get(r.local_date) ?? []), r]);
  for (const [date, entries] of byDate) {
    for (const a of adj.filter((x) => String(x.local_date) === date)) {
      const source = String(a.source_date);
      // Eat-out meals are a budget, not a dish: they keep their number.
      const open = entries.filter((e) => e.metadata?.kind !== "eat_out" && !((e.metadata?.carry_from as string[] | undefined) ?? []).includes(source));
      if (!open.length) continue;
      const meals = open.map((e) => ({ slot: e.meal_slot, items: (e.metadata?.items as PlanItem[]) ?? [], totals: (e.metadata?.totals as Totals) ?? sumTotals([]) }));
      const resized = spreadCarry(meals, Number(a.kcal_delta), budgets);
      for (let i = 0; i < open.length; i++) {
        const e = open[i]!;
        const m = resized[i]!;
        const meta = { ...(e.metadata ?? {}), items: m.items, totals: m.totals, carry_from: [...((e.metadata?.carry_from as string[] | undefined) ?? []), source] };
        e.metadata = meta;
        const { error: e3 } = await supabase
          .from("meal_plan_entries")
          .update({
            metadata: meta,
            estimated_calories: m.totals.kcal,
            estimated_protein_g: m.totals.proteinG,
            estimated_carbs_g: m.totals.carbsG,
            estimated_fat_g: m.totals.fatG,
            updated_at: new Date().toISOString(),
          })
          .eq("id", e.id)
          .eq("status", "planned");
        if (e3) throw new Error(e3.message);
        changed = true;
      }
    }
  }
  return changed;
}
