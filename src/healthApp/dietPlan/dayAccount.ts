/**
 * One day's numbers, each with one meaning and one way to compute it. This is the only place
 * day totals are added up; the Meals tab header, the Today card and the tests all read it.
 *
 * - target: the person's daily targets (never changed by the plan).
 * - meals: planned meals with known food, as saved (swaps, edits and rebalances included).
 * - supplements: the daily supplements, counted here once. They were also taken off the meal
 *   budgets when the plan was built (supplements.ts), which is why meals + supplements lands
 *   near the target instead of over it. They are not inside any meal's totals.
 * - planned = meals + supplements: food we know about.
 * - allowances: meals eaten out, a calorie allowance only. Their protein, carbs and fat are
 *   unknown, so they are never added to the macros or counted toward the protein target.
 * - unallocated = target − planned − allowances: calories nothing is planned for yet.
 * - logged: what was actually eaten from the plan (eaten items, not the planned ones).
 *
 * Calories and macros are reconciled with 4/4/9 (protein, carbs, fat). Catalog numbers come from
 * sources that count fibre and rounding differently, so a gap up to RECONCILE_TOLERANCE is
 * expected; a bigger one is reported, not forced away. Pure.
 */
import type { PlanItem, Totals } from "./compose.js";
import type { SupplementLine } from "./supplements.js";
import type { MacroTargets, PlanSlot } from "./targets.js";

/** Share of calories that 4/4/9 may differ by before the day is flagged (fibre ≈ 2 kcal/g, rounding, label conventions). */
export const RECONCILE_TOLERANCE = 0.08;

export type Macros4 = { kcal: number; proteinG: number; carbsG: number; fatG: number };

export type AccountMeal = {
  slot: PlanSlot;
  kind: "option" | "eat_out";
  status: string;
  totals: Totals | Macros4;
  eatenItems?: PlanItem[];
  items?: PlanItem[];
};

export type DayAccount = {
  date: string;
  target: Macros4;
  meals: Macros4;
  supplements: Macros4;
  planned: Macros4;
  allowances: Array<{ slot: PlanSlot; kcal: number }>;
  allowanceKcal: number;
  unallocatedKcal: number;
  /** Protein the known food doesn't reach; with an eat-out allowance, it has to come from that meal. */
  proteinShortG: number;
  logged: Macros4 & { meals: number };
  /** Calories from 4/4/9 vs the planned calories. */
  reconcile: { fromMacrosKcal: number; diffPct: number; ok: boolean };
};

const r1 = (n: number) => Math.round(n * 10) / 10;
const zero = (): Macros4 => ({ kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 });
const add = (a: Macros4, b: Partial<Macros4>): Macros4 => ({
  kcal: a.kcal + (b.kcal ?? 0),
  proteinG: a.proteinG + (b.proteinG ?? 0),
  carbsG: a.carbsG + (b.carbsG ?? 0),
  fatG: a.fatG + (b.fatG ?? 0),
});
const tidy = (m: Macros4): Macros4 => ({ kcal: Math.round(m.kcal), proteinG: r1(m.proteinG), carbsG: r1(m.carbsG), fatG: r1(m.fatG) });
const isEaten = (m: AccountMeal) => m.status === "logged" || m.status === "partial";

export function accountDay(input: { date: string; targets: MacroTargets; meals: AccountMeal[]; supplements: SupplementLine[] }): DayAccount {
  const target = { kcal: input.targets.calories, proteinG: input.targets.proteinG, carbsG: input.targets.carbsG, fatG: input.targets.fatG };
  let meals = zero();
  const allowances: DayAccount["allowances"] = [];
  let logged = zero();
  let eatenCount = 0;
  for (const m of input.meals) {
    if (m.kind === "eat_out" && !isEaten(m)) {
      allowances.push({ slot: m.slot, kcal: Math.round(m.totals.kcal) });
      continue;
    }
    const eatenTotals = m.eatenItems?.length ? m.eatenItems.reduce((a, i) => add(a, i), zero()) : null;
    // An eaten meal counts as eaten (what they had); a planned one as planned.
    const t = isEaten(m) && eatenTotals ? eatenTotals : m.totals;
    meals = add(meals, t);
    if (isEaten(m)) {
      logged = add(logged, t);
      eatenCount++;
    }
  }
  const supplements = input.supplements.reduce((a, l) => add(a, l), zero());
  const planned = add(meals, supplements);
  const allowanceKcal = allowances.reduce((a, x) => a + x.kcal, 0);
  const fromMacros = planned.proteinG * 4 + planned.carbsG * 4 + planned.fatG * 9;
  const diffPct = planned.kcal ? Math.abs(fromMacros - planned.kcal) / planned.kcal : 0;
  return {
    date: input.date,
    target,
    meals: tidy(meals),
    supplements: tidy(supplements),
    planned: tidy(planned),
    allowances,
    allowanceKcal,
    unallocatedKcal: Math.round(target.kcal - planned.kcal - allowanceKcal),
    proteinShortG: Math.max(0, Math.round(target.proteinG - planned.proteinG)),
    logged: { ...tidy(logged), meals: eatenCount },
    reconcile: { fromMacrosKcal: Math.round(fromMacros), diffPct: Math.round(diffPct * 1000) / 1000, ok: diffPct <= RECONCILE_TOLERANCE },
  };
}
