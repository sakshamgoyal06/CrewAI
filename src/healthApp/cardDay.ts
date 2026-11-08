/**
 * When a chat card's day is over. A day closes at 05:00 the next morning (when the day plan
 * posts), not at midnight, so a card stays answerable through a late night. After that its
 * buttons freeze and it shows its final state, read live from the logs (chatCards.ts). Nothing
 * is written when a day closes: it is worked out from the card's date every time it is shown.
 * Pure.
 */
import { localDateKey } from "../nutrition/localDate.js";

export const DAY_CLOSE_HOUR = 5;

/** The newest day that is still open: today after 05:00, yesterday before it. */
export function openDayAt(now: Date, timezone: string): string {
  return localDateKey(new Date(now.getTime() - DAY_CLOSE_HOUR * 3_600_000), timezone);
}

export function isDayClosed(date: string, now: Date, timezone: string): boolean {
  return date < openDayAt(now, timezone);
}

/** Where a posted card sits in time: its local day, and whether that day has closed. */
export type CardAt = { date: string; closed: boolean };

export function cardAt(createdAt: string | undefined, timezone: string | undefined, now: Date): CardAt | undefined {
  if (!createdAt || !timezone) return undefined;
  const t = Date.parse(createdAt);
  if (Number.isNaN(t)) return undefined;
  const date = localDateKey(new Date(t), timezone);
  return { date, closed: isDayClosed(date, now, timezone) };
}
