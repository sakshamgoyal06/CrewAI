/**
 * Wall-clock time in the user's timezone, converted to instants for storage.
 *
 * The model writes times the way the user says them ("2026-07-31T21:00"), with no offset. Reading
 * that with `new Date()` would silently interpret it as the host's timezone, so a 9pm session in
 * Kolkata would land at 9pm UTC on a Railway box. Everything here converts through the named zone
 * instead.
 */

const NAIVE_DATETIME = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/;
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const HAS_OFFSET = /(?:Z|[+-]\d{2}:?\d{2})$/i;

export function isDateOnly(value: string): boolean {
  return DATE_ONLY.test(value.trim());
}

/** Offset of `timeZone` from UTC, in ms, at the given instant. */
function zoneOffsetMs(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);

  const get = (type: string): number => Number(parts.find((p) => p.type === type)?.value ?? "0");
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return asUtc - at.getTime();
}

/**
 * Turns a time as written by the user into an instant.
 *
 * Accepts a naive local datetime, a date on its own (local midnight), or anything already carrying
 * an offset — which is passed through untouched, since it already names an instant.
 */
export function zonedTimeToInstant(value: string, timeZone: string): Date | null {
  const raw = value.trim();
  if (!raw) {
    return null;
  }

  if (HAS_OFFSET.test(raw)) {
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const dateOnly = DATE_ONLY.exec(raw);
  const parts = dateOnly
    ? [raw, dateOnly[1], dateOnly[2], dateOnly[3], "00", "00", "00"]
    : NAIVE_DATETIME.exec(raw);
  if (!parts) {
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const [, y, mo, d, h, mi, s] = parts;
  const naiveUtc = Date.UTC(
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(h),
    Number(mi),
    Number(s ?? "0"),
  );
  if (Number.isNaN(naiveUtc)) {
    return null;
  }

  try {
    // Two passes: the first offset is read at the wrong instant when a DST change falls between
    // the guess and the answer, so re-read it at the candidate and use that.
    const firstPass = naiveUtc - zoneOffsetMs(new Date(naiveUtc), timeZone);
    const secondPass = naiveUtc - zoneOffsetMs(new Date(firstPass), timeZone);
    return new Date(secondPass);
  } catch {
    return new Date(naiveUtc);
  }
}

/** `YYYY-MM-DD` for an instant, as seen in the given zone. */
export function localDateKey(at: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(at);
  } catch {
    return at.toISOString().slice(0, 10);
  }
}

/** Start of the local day, `days` away from `from`, as an instant. */
export function startOfLocalDay(from: Date, timeZone: string, days = 0): Date {
  const key = localDateKey(new Date(from.getTime() + days * 24 * 60 * 60 * 1000), timeZone);
  return zonedTimeToInstant(`${key}T00:00:00`, timeZone) ?? from;
}

/** "Fri 31 Jul 21:00" — how a time is shown back to the model. */
export function formatInstant(at: Date, timeZone: string, options?: { dateOnly?: boolean }): string {
  try {
    const day = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      weekday: "short",
      day: "numeric",
      month: "short",
    }).format(at);
    if (options?.dateOnly) {
      return day;
    }
    const time = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(at);
    return `${day} ${time}`;
  } catch {
    return at.toISOString();
  }
}

/** "21:00" from a minute-of-day, for describing when something usually happens. */
export function formatMinuteOfDay(minuteOfDay: number): string {
  const safe = Math.max(0, Math.min(24 * 60 - 1, Math.round(minuteOfDay)));
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** "1h 20m" / "45m" — durations the way a person says them. */
export function formatMinutes(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) {
    return `${m}m`;
  }
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
