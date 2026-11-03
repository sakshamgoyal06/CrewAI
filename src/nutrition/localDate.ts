/**
 * User-local calendar date helpers (meal logs, chat days, limits).
 */

export type LocalTimeParts = {
  hour: number;
  minute: number;
  /** YYYY-MM-DD in the given timezone. */
  dateKey: string;
};

/** Hour (0–23), minute and calendar date in `timeZone` for the instant `date`. */
export function getLocalTimeParts(date: Date, timeZone: string): LocalTimeParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes): string => parts.find((p) => p.type === type)?.value ?? "0";
  const hour = Number.parseInt(get("hour"), 10);
  const minute = Number.parseInt(get("minute"), 10);
  return {
    // Some engines print midnight as "24" with hour12: false.
    hour: Number.isNaN(hour) ? 0 : hour % 24,
    minute: Number.isNaN(minute) ? 0 : minute,
    dateKey: `${get("year")}-${get("month")}-${get("day")}`,
  };
}

export const DEFAULT_TIMEZONE = "UTC";

/** Resolve a timezone string; falls back to UTC when missing or invalid. */
export function resolveTimezone(timezone?: string | null): string {
  const tz = timezone?.trim();
  if (!tz) {
    return DEFAULT_TIMEZONE;
  }
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return tz;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

/** YYYY-MM-DD in the user's timezone for `instant` (default: now). */
export function localDateKey(instant: Date, timezone?: string | null): string {
  return getLocalTimeParts(instant, resolveTimezone(timezone)).dateKey;
}

/** Short label for replies, e.g. "IST" or "UTC". */
export function timezoneAbbrev(timezone?: string | null): string {
  const tz = resolveTimezone(timezone);
  if (tz === "UTC") {
    return "UTC";
  }
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      timeZoneName: "short",
    }).formatToParts(new Date());
    const name = parts.find((p) => p.type === "timeZoneName")?.value;
    return name?.trim() || tz;
  } catch {
    return tz;
  }
}
