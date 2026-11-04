/**
 * Keeping the day on target when it doesn't go to plan. Pure.
 *
 * Same-day rebalance: after they eat something else, the meals still to come are resized so the
 * day lands near its calories. Carb-heavy items (roti, rice) move first; protein-dense ones stay.
 * No remaining meal goes under 60% of its budget, and protein is never cut.
 *
 * Day close: a day inside the on-track band (85–105% of calories) is left alone. A bigger miss is
 * spread over the next 2 days, at most 200 kcal a day, never under the calorie floor; protein
 * stays the same and no meal is ever skipped to make up for it.
 */
import { catalog, type Catalog } from "../../meals/catalog/index.js";
import { itemFor, sumTotals, type MealOption, type PlanItem, type Totals } from "./compose.js";
import { DAY_BAND, type MacroTargets, type MealBudget, type PlanSlot } from "./targets.js";
import { dateOf, dayNumber } from "../../util/time.js";

export const MIN_MEAL_SHARE = 0.6;
export const MAX_MEAL_STRETCH = 1.3;
/** Don't touch the rest of the day for less than this share of the day's calories. */
const IGNORE_SHARE = 0.05;
export const CARRY_DAYS = 2;
export const MAX_CARRY_KCAL = 200;

export type Rebalanced = { slot: PlanSlot; from: MealOption; items: PlanItem[]; totals: Totals; changes: string[] };

/** The meal's base (roti, rice, bread, paratha); for an item outside the catalog, protein under a quarter of its calories. */
function carbHeavy(i: PlanItem, cat: Catalog): boolean {
  const e = i.key ? cat.byKey.get(i.key) : undefined;
  if (e && i.servingId) return e.category === "bread" || e.category === "grain" || e.key === "jeera rice";
  return i.kcal > 0 && (i.proteinG * 4) / i.kcal < 0.25;
}

/** The household step for an item: 1 for pieces and slices, ½ for katoris and the like, ¼ of the usual for a usual-meal item. */
export function qtyStep(i: PlanItem, cat: Catalog = catalog()): number {
  const s = servingOf(i, cat);
  if (s) return s.unit === "piece" || s.unit === "slice" ? 1 : 0.5;
  return 0.25;
}

function servingOf(i: PlanItem, cat: Catalog) {
  const e = i.key ? cat.byKey.get(i.key) : undefined;
  const s = e && i.servingId ? e.servings.find((x) => [e.key, x.unit, x.size].filter(Boolean).join(":") === i.servingId) : undefined;
  return e && s ? { e, s, unit: s.unit } : null;
}

/** The same item at a new quantity: catalog items are re-portioned exactly, others scaled. */
export function setQty(i: PlanItem, qty: number, cat: Catalog = catalog()): PlanItem {
  const sv = servingOf(i, cat);
  if (sv) return itemFor(sv.e, sv.s, qty);
  const f = i.qty ? qty / i.qty : 1;
  return {
    ...i,
    qty,
    text: i.text.replace(/\s*\([^)]*× usual\)$/, "") + (qty === 1 ? "" : ` (${qty}× usual)`),
    kcal: Math.round(i.kcal * f),
    proteinG: Math.round(i.proteinG * f * 10) / 10,
    carbsG: Math.round(i.carbsG * f * 10) / 10,
    fatG: Math.round(i.fatG * f * 10) / 10,
    fiberG: Math.round(i.fiberG * f * 10) / 10,
  };
}

function step(i: PlanItem, dir: 1 | -1, cat: Catalog): PlanItem | null {
  const unit = qtyStep(i, cat);
  const qty = Math.round((i.qty + dir * unit) * 100) / 100;
  if (qty < (servingOf(i, cat) ? unit : 0.5)) return null;
  return setQty(i, qty, cat);
}

/** Resizes one meal toward `goal` kcal, stepping its carb-heavy items, within its floor and ceiling. */
export function resizeMeal(o: MealOption, goal: number, budget: MealBudget, cat: Catalog = catalog()): { items: PlanItem[]; totals: Totals } {
  let items = o.items.map((i) => ({ ...i }));
  const lo = budget.calories * MIN_MEAL_SHARE;
  const hi = budget.calories * MAX_MEAL_STRETCH;
  const target = Math.max(lo, Math.min(hi, goal));
  for (let guard = 0; guard < 12; guard++) {
    const total = sumTotals(items).kcal;
    const dir: 1 | -1 = target < total ? -1 : 1;
    // Largest carb item first when cutting, smallest when adding.
    const order = items
      .map((i, idx) => ({ i, idx }))
      .filter((x) => carbHeavy(x.i, cat))
      .sort((a, b) => (dir < 0 ? b.i.kcal - a.i.kcal : a.i.kcal - b.i.kcal));
    let moved = false;
    for (const { i, idx } of order) {
      const next = step(i, dir, cat);
      if (!next) continue;
      const after = total - i.kcal + next.kcal;
      // Take the step only if it gets closer and stays inside the floor and ceiling.
      if (Math.abs(after - target) >= Math.abs(total - target) || after < lo || after > hi) continue;
      items = items.map((x, k) => (k === idx ? next : x));
      moved = true;
      break;
    }
    if (!moved) break;
  }
  return { items, totals: sumTotals(items) };
}

export function rebalanceDay(input: {
  target: MacroTargets;
  budgets: MealBudget[];
  /** What they have eaten today so far. */
  eaten: Totals;
  /** Planned meals still to come. */
  remaining: MealOption[];
  cat?: Catalog;
}): Rebalanced[] {
  const cat = input.cat ?? catalog();
  if (!input.remaining.length) return [];
  const planned = input.remaining.reduce((a, o) => a + o.totals.kcal, 0);
  const left = input.target.calories - input.eaten.kcal;
  if (Math.abs(left - planned) < input.target.calories * IGNORE_SHARE) return [];
  const f = Math.max(0, left) / planned;
  const out: Rebalanced[] = [];
  for (const o of input.remaining) {
    const budget = input.budgets.find((b) => b.slot === o.slot);
    if (!budget) continue;
    const r = resizeMeal(o, o.totals.kcal * f, budget, cat);
    const changes: string[] = [];
    r.items.forEach((n, i) => {
      const old = o.items[i]!;
      if (n.qty !== old.qty) changes.push(`${n.text} instead of ${old.text}`);
    });
    if (changes.length) out.push({ slot: o.slot, from: o, items: r.items, totals: r.totals, changes });
  }
  return out;
}

export type DayClose = {
  date: string;
  status: "on_track" | "over" | "under";
  eatenKcal: number;
  targetKcal: number;
  /** Calorie changes for the next days; empty when the day was inside the band. */
  carry: Array<{ date: string; kcalDelta: number }>;
  summary: string;
};

const kcal = (n: number) => `${Math.round(n).toLocaleString("en-US")} kcal`;

export function closeDay(input: { date: string; target: MacroTargets; eaten: Totals; floorKcal: number }): DayClose {
  const t = input.target.calories;
  const e = input.eaten.kcal;
  const base = { date: input.date, eatenKcal: Math.round(e), targetKcal: t };
  if (e >= t * DAY_BAND.low && e <= t * DAY_BAND.high) {
    return { ...base, status: "on_track", carry: [], summary: `${kcal(e)} of ${kcal(t)}: on track. Tomorrow's plan stays as it is.` };
  }
  const over = e > t;
  // Spread half the miss over the next two days, capped, so no single day swings hard.
  const perDay = Math.min(MAX_CARRY_KCAL, Math.round(Math.abs(e - t) / CARRY_DAYS / 2 / 10) * 10);
  const carry: DayClose["carry"] = [];
  for (let d = 1; d <= CARRY_DAYS; d++) {
    let delta = over ? -perDay : perDay;
    if (t + delta < input.floorKcal) delta = Math.min(0, input.floorKcal - t);
    if (delta !== 0) carry.push({ date: dateOf(dayNumber(input.date) + d), kcalDelta: delta });
  }
  const what = over ? `${kcal(e - t)} over` : `${kcal(t - e)} under`;
  const summary = carry.length
    ? `${kcal(e)} of ${kcal(t)}, ${what}. The next ${carry.length === 1 ? "day is" : `${carry.length} days are`} ${over ? "lighter" : "a little bigger"} by ${kcal(Math.abs(carry[0]!.kcalDelta))}, with protein unchanged.`
    : `${kcal(e)} of ${kcal(t)}, ${what}. Your target is already at its floor, so the plan stays as it is.`;
  return { ...base, status: over ? "over" : "under", carry, summary };
}
