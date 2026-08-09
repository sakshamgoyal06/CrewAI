/**
 * User-local calendar date helpers for nutrition (meal logs, rollups, reminders).
 */
import { getLocalTimeParts } from "../jobs/morningBriefTime.js";

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
