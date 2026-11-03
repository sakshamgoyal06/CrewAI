/**
 * Time helpers shared by the whole server. Two kinds of value:
 * - date keys: "YYYY-MM-DD" calendar dates, compared and stepped as whole UTC days;
 * - instants: Dates, turned into a person's wall clock with their IANA timezone.
 * Every helper that formats with Intl uses hourCycle h23, so midnight is 00, never 24.
 */

export const DAY_MS = 86_400_000;

/** Whole days since 1970-01-01 for a date key. */
export const dayNumber = (date: string): number => Math.round(Date.parse(`${date}T00:00:00Z`) / DAY_MS);

/** The date key for a day number. */
export const dateOf = (n: number): string => new Date(n * DAY_MS).toISOString().slice(0, 10);

/** `date` moved by `n` days. */
export const addDays = (date: string, n: number): string => dateOf(dayNumber(date) + n);

/** Days from `a` to `b` (negative when b is earlier). */
export const daysBetween = (a: string, b: string): number => dayNumber(b) - dayNumber(a);

export type LocalClock = {
  /** "07:05" */
  hhmm: string;
  hour: number;
  minute: number;
  /** Minutes since local midnight. */
  minutes: number;
  /** 0 = Sunday … 6 = Saturday. */
  weekday: number;
  /** Local calendar date. */
  dateKey: string;
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** The person's wall clock at `instant`. */
export function localClock(instant: Date, timezone: string): LocalClock {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  }).formatToParts(instant);
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? "";
  const hour = Number(get("hour")) % 24;
  const minute = Number(get("minute"));
  return {
    hhmm: `${String(hour).padStart(2, "0")}:${get("minute")}`,
    hour,
    minute,
    minutes: hour * 60 + minute,
    weekday: WEEKDAYS.indexOf(get("weekday")),
    dateKey: `${get("year")}-${get("month")}-${get("day")}`,
  };
}

/** Local time of day of an ISO instant as a fractional hour (7:30 → 7.5). */
export function localHourOf(iso: string, timezone: string): number {
  const c = localClock(new Date(iso), timezone);
  return c.hour + c.minute / 60;
}

/** Offset of `timezone` from UTC at `instant`, in ms (positive east of UTC). */
export function tzOffsetMs(instant: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}
