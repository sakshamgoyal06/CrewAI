import { startOfLocalDay } from "../../events/eventTime.js";
import { offsetDateKey } from "../../nutrition/parseMealPlanJson.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export function dateKeyDiff(fromKey: string, toKey: string): number {
  const a = new Date(`${fromKey}T00:00:00Z`).getTime();
  const b = new Date(`${toKey}T00:00:00Z`).getTime();
  return Math.round((b - a) / DAY_MS);
}

/** UTC midnight range covering one local calendar day in `timezone`. */
export function localDayRange(
  dateKey: string,
  timezone: string,
  anchorNow: Date,
  todayKey: string,
): { from: Date; to: Date } {
  const offsetDays = dateKeyDiff(todayKey, dateKey);
  const from = startOfLocalDay(anchorNow, timezone, offsetDays);
  const to = startOfLocalDay(anchorNow, timezone, offsetDays + 1);
  return { from, to };
}

export function weekDateKeys(endDateKey: string): string[] {
  const keys: string[] = [];
  for (let i = 6; i >= 0; i -= 1) {
    keys.push(offsetDateKey(endDateKey, -i));
  }
  return keys;
}
