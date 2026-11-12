/**
 * Minimum days, the "bad day" mode (12 Nov plan, item 6). On a rough day (ill, slammed, travelling,
 * low) the full plan is out of reach, and an all-or-nothing day teaches people to give up on it.
 * A minimum day asks for two small things instead: a protein anchor (half the protein target) and
 * a steps floor (5,000, or the step target if that's lower). Meeting both keeps the day, labelled
 * minimum. Calories aren't judged, so logging one meal (often dinner) is enough.
 *
 * At most MIN_DAY.perWeek in any 7 days, so it stays a way through a bad day, not a lower bar.
 * Only today, or yesterday (a day that went wrong is often only admitted the next morning).
 */
import { addDays } from "../util/time.js";

export const MIN_DAY = { proteinShare: 0.5, stepsFloor: 5000, perWeek: 2 } as const;

/** The two things a minimum day asks for, for these targets. Pure. */
export function minimumAsks(targets: { proteinTarget: number | null; stepTarget: number }): { proteinG: number | null; steps: number } {
  const p = targets.proteinTarget && targets.proteinTarget > 0 ? Math.round((targets.proteinTarget * MIN_DAY.proteinShare) / 5) * 5 : null;
  return { proteinG: p, steps: Math.min(MIN_DAY.stepsFloor, targets.stepTarget) };
}

export type MinimumCheck = { ok: true } | { ok: false; error: "bad_date" | "too_many"; max?: number };

/** Whether `date` can become a minimum day, given the minimum days already set. Pure. */
export function canSetMinimum(existing: Iterable<string>, date: string, today: string): MinimumCheck {
  if (date !== today && date !== addDays(today, -1)) return { ok: false, error: "bad_date" };
  const set = new Set(existing);
  if (set.has(date)) return { ok: true };
  // Every 7-day window that holds `date` must stay within the limit.
  for (let start = -6; start <= 0; start++) {
    const from = addDays(date, start);
    const to = addDays(from, 6);
    let n = 1;
    for (const d of set) if (d >= from && d <= to) n++;
    if (n > MIN_DAY.perWeek) return { ok: false, error: "too_many", max: MIN_DAY.perWeek };
  }
  return { ok: true };
}
