/**
 * Timezone helpers for scheduling the brief in `user_profile.timezone`.
 */

export type LocalTimeParts = {
  hour: number;
  minute: number;
  /** YYYY-MM-DD in the given timezone (for idempotency keys). */
  dateKey: string;
};

/**
 * Returns hour (0–23), minute, and calendar date in `timeZone` for `date` (instant).
 */
export function getLocalTimeParts(date: Date, timeZone: string): LocalTimeParts {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour12: false,
  });
  const parts = dtf.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === type)?.value ?? "0";
  const hour = Number.parseInt(get("hour"), 10);
  const minute = Number.parseInt(get("minute"), 10);
  const y = get("year");
  const m = get("month");
  const day = get("day");
  const dateKey = `${y}-${m}-${day}`;
  return {
    hour: Number.isNaN(hour) ? 0 : hour,
    minute: Number.isNaN(minute) ? 0 : minute,
    dateKey,
  };
}

export function isInMorningBriefWindow(
  parts: LocalTimeParts,
  targetHour: number,
  windowMinutes: number,
): boolean {
  if (parts.hour !== targetHour) {
    return false;
  }
  return parts.minute <= windowMinutes;
}
