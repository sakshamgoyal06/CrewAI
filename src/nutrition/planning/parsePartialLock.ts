/**
 * Parse partial plan lock requests (e.g. save Mon–Wed only).
 */
import { offsetDateKey } from "../parseMealPlanJson.js";

const DAY_NAMES: Record<string, number> = {
  sun: 0,
  sunday: 0,
  mon: 1,
  monday: 1,
  tue: 2,
  tues: 2,
  tuesday: 2,
  wed: 3,
  weds: 3,
  wednesday: 3,
  thu: 4,
  thur: 4,
  thurs: 4,
  thursday: 4,
  fri: 5,
  friday: 5,
  sat: 6,
  saturday: 6,
};

const PARTIAL_LOCK_RE =
  /\b(?:save|lock)\s+(?:plan\s+)?(?:for\s+)?(.+?)(?:\s+only)?\s*$/i;

const DATE_RANGE_RE = /(\d{4}-\d{2}-\d{2})\s*(?:to|through|–|-)\s*(\d{4}-\d{2}-\d{2})/i;

function listDatesInRange(start: string, end: string): string[] {
  const dates: string[] = [];
  let cursor = start;
  while (cursor <= end) {
    dates.push(cursor);
    if (cursor === end) {
      break;
    }
    cursor = offsetDateKey(cursor, 1);
    if (dates.length > 14) {
      break;
    }
  }
  return dates;
}

function weekdayIndex(dateKey: string): number {
  return new Date(`${dateKey}T12:00:00Z`).getUTCDay();
}

function parseDayToken(token: string): number | null {
  const key = token.trim().toLowerCase().replace(/\./g, "");
  return DAY_NAMES[key] ?? null;
}

function datesForWeekdayInHorizon(
  weekday: number,
  horizonStart: string,
  horizonEnd: string,
): string[] {
  return listDatesInRange(horizonStart, horizonEnd).filter(
    (d) => weekdayIndex(d) === weekday,
  );
}

function parseDayRangeFragment(
  fragment: string,
  horizonStart: string,
  horizonEnd: string,
): string[] | null {
  const rangeMatch = fragment.match(
    /\b(sun(?:day)?|mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?)\s*(?:-|–|through|to)\s*(sun(?:day)?|mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?)\b/i,
  );
  if (rangeMatch?.[1] && rangeMatch[2]) {
    const startDay = parseDayToken(rangeMatch[1]);
    const endDay = parseDayToken(rangeMatch[2]);
    if (startDay === null || endDay === null) {
      return null;
    }
    const allDates = listDatesInRange(horizonStart, horizonEnd);
    const out: string[] = [];
    for (const d of allDates) {
      const wd = weekdayIndex(d);
      if (startDay <= endDay) {
        if (wd >= startDay && wd <= endDay) {
          out.push(d);
        }
      } else if (wd >= startDay || wd <= endDay) {
        out.push(d);
      }
    }
    return out.length ? out : null;
  }

  const tokens = fragment
    .split(/,|\band\b/)
    .map((t) => t.trim())
    .filter(Boolean);
  const dates = new Set<string>();
  for (const token of tokens) {
    const wd = parseDayToken(token);
    if (wd === null) {
      continue;
    }
    for (const d of datesForWeekdayInHorizon(wd, horizonStart, horizonEnd)) {
      dates.add(d);
    }
  }
  return dates.size ? [...dates].sort() : null;
}

/** Returns local dates to lock, or null if not a partial-lock command. */
export function parsePartialLockDates(
  raw: string,
  horizonStart: string,
  horizonEnd: string,
): string[] | null {
  const text = raw.trim();
  const dateRange = text.match(DATE_RANGE_RE);
  if (dateRange?.[1] && dateRange[2]) {
    const start = dateRange[1] <= dateRange[2] ? dateRange[1] : dateRange[2];
    const end = dateRange[1] <= dateRange[2] ? dateRange[2] : dateRange[1];
    const dates = listDatesInRange(start, end).filter(
      (d) => d >= horizonStart && d <= horizonEnd,
    );
    return dates.length ? dates : null;
  }

  const m = text.match(PARTIAL_LOCK_RE);
  if (!m?.[1]) {
    return null;
  }

  const fragment = m[1]
    .replace(/\bonly\b/gi, "")
    .replace(/\bplan\b/gi, "")
    .trim();

  if (/^(?:yes|it|the plan|looks good|perfect)$/i.test(fragment)) {
    return null;
  }

  return parseDayRangeFragment(fragment, horizonStart, horizonEnd);
}

export function isFullLockCommand(raw: string): boolean {
  return /^(?:yes|yep|yeah|save(?:\s+(?:it|plan|the\s+plan))?|lock(?:\s+(?:it|plan|the\s+plan))?|looks?\s+good|perfect|go\s+ahead|confirm|ship\s+it|that\s+works)\s*$/i.test(
    raw.trim(),
  );
}
