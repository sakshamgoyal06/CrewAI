/**
 * The rolling 3-day plan: today and the next two days, one option per meal per day. Pure.
 *
 * - A day already planned keeps its picks (only the person or a rebalance changes them).
 * - Pinned options are picked every day.
 * - Otherwise options go in rank order, skipping any eaten or planned in the 2 days before, so
 *   nothing repeats within 3 days while there are options left.
 * - Among those, a familiar meal (popularity 3+) comes first, and one from a cuisine the day
 *   doesn't have yet (South Indian lunch, then not a South Indian dinner); "everyday" home food
 *   never counts as a repeat.
 * - A meal they usually eat out is planned as a budget ("Eating out, about 700 kcal").
 */
import type { MealOption, Totals } from "./compose.js";
import { isEatOut, type DietPrefs } from "./prefs.js";
import type { MealBudget, PlanSlot } from "./targets.js";
import { dateOf, dayNumber } from "../../util/time.js";

export const PLAN_DAYS = 3;
const NO_REPEAT_DAYS = 2;

export type DayPick = {
  date: string;
  slot: PlanSlot;
  kind: "option" | "eat_out";
  optionId: string | null;
  title: string;
  totals: Totals;
};

export type PriorPick = {
  date: string;
  slot: PlanSlot;
  optionId: string | null;
  /** What was saved for the meal, kept when a rebuilt plan no longer offers its option. */
  title?: string;
  totals?: Totals;
  kind?: "option" | "eat_out";
};

const weekday = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();

export function pickDays(input: {
  start: string;
  days?: number;
  budgets: MealBudget[];
  options: Partial<Record<PlanSlot, MealOption[]>>;
  prefs: DietPrefs;
  pinned?: string[];
  /** Picks already stored for the window or before it (for the no-repeat rule). */
  existing?: PriorPick[];
  /** "Ingredients unavailable today": skip these options on these dates only. */
  unavailable?: Array<{ date: string; optionId: string }>;
}): DayPick[] {
  const pinned = new Set(input.pinned ?? []);
  const days = input.days ?? PLAN_DAYS;
  const known = new Map((input.existing ?? []).map((p) => [`${p.date}|${p.slot}`, p]));
  const history: PriorPick[] = [...(input.existing ?? [])];
  const out: DayPick[] = [];

  for (let d = 0; d < days; d++) {
    const date = dateOf(dayNumber(input.start) + d);
    const dayCuisines = new Set<string>();
    const note = (o: MealOption | undefined) => {
      if (o?.cuisine && o.cuisine !== "everyday") dayCuisines.add(o.cuisine);
    };
    for (const b of input.budgets) {
      const list = input.options[b.slot] ?? [];
      const prior = known.get(`${date}|${b.slot}`);
      if (prior) {
        const o = list.find((x) => x.id === prior.optionId);
        note(o);
        if (o) out.push(pickOf(date, b.slot, o));
        else if (prior.optionId === null) out.push(eatOut(date, b));
        // A rebuilt plan no longer offers this option, but the meal is already planned (or eaten): keep it, never drop it.
        else out.push({ date, slot: b.slot, kind: prior.kind ?? "option", optionId: prior.optionId, title: prior.title ?? "Planned meal", totals: prior.totals ?? { kcal: b.calories, proteinG: b.proteinG, carbsG: b.carbsG, fatG: b.fatG, fiberG: 0 } });
        continue;
      }
      if (isEatOut(input.prefs, weekday(date), b.slot)) {
        out.push(eatOut(date, b));
        history.push({ date, slot: b.slot, optionId: null });
        continue;
      }
      if (!list.length) continue;
      const recent = new Set(
        history
          .filter((h) => h.slot === b.slot && h.optionId && dayNumber(h.date) < dayNumber(date) && dayNumber(h.date) >= dayNumber(date) - NO_REPEAT_DAYS)
          .map((h) => h.optionId!),
      );
      // "Try something new" options wait to be chosen; the plan never picks them for anyone.
      const everyday = list.filter((o) => !o.novelty || pinned.has(o.id));
      const skip = new Set(input.unavailable?.filter((u) => u.date === date).map((u) => u.optionId) ?? []);
      const usable = everyday.filter((o) => !skip.has(o.id));
      const pool = usable.length ? usable : everyday.length ? everyday : list;
      const fresh = pool.filter((o) => !recent.has(o.id));
      const familiar = (o: MealOption) => (o.popularity ?? 3) >= 3;
      const newCuisine = (o: MealOption) => !o.cuisine || o.cuisine === "everyday" || !dayCuisines.has(o.cuisine);
      const choice =
        list.find((o) => pinned.has(o.id)) ??
        fresh.find((o) => familiar(o) && newCuisine(o)) ??
        fresh.find(familiar) ??
        fresh[0] ??
        leastRecent(pool, history, b.slot);
      out.push(pickOf(date, b.slot, choice));
      note(choice);
      history.push({ date, slot: b.slot, optionId: choice.id });
    }
  }
  return out;
}

function leastRecent(list: MealOption[], history: PriorPick[], slot: PlanSlot): MealOption {
  const last = new Map<string, number>();
  for (const h of history) if (h.slot === slot && h.optionId) last.set(h.optionId, Math.max(last.get(h.optionId) ?? -Infinity, dayNumber(h.date)));
  return [...list].sort((a, b) => (last.get(a.id) ?? -Infinity) - (last.get(b.id) ?? -Infinity))[0]!;
}

function pickOf(date: string, slot: PlanSlot, o: MealOption): DayPick {
  return { date, slot, kind: "option", optionId: o.id, title: o.title, totals: o.totals };
}

function eatOut(date: string, b: MealBudget): DayPick {
  return {
    date,
    slot: b.slot,
    kind: "eat_out",
    optionId: null,
    title: `Eating out, about ${b.calories} kcal`,
    // An allowance, not a known meal: its protein, carbs and fat are unknown, so they're 0 here and dayAccount.ts never counts them.
    totals: { kcal: b.calories, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 },
  };
}
