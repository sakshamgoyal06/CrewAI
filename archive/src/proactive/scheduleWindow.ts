import type { LocalTimeParts } from "../jobs/morningBriefTime.js";

/**
 * True when `parts` falls in the first `windowMinutes` of `targetHour` (local time).
 */
export function isInLocalHourWindow(
  parts: LocalTimeParts,
  targetHour: number,
  windowMinutes: number,
): boolean {
  if (parts.hour !== targetHour) {
    return false;
  }
  return parts.minute <= windowMinutes;
}
