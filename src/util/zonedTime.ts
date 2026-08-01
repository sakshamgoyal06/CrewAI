/**
 * Wall-clock time in an IANA zone, both directions, with no date library.
 *
 * The model writes times the way the user says them — "21:00" — and the database stores instants.
 * Turning one into the other needs the zone's offset *at that moment*, which `Intl` can give us:
 * format the instant in the target zone, read the parts back as if they were UTC, and the
 * difference is the offset. One refinement pass handles the hour either side of a DST change,
 * where the first guess can land on the wrong side of the jump.
 */

const ISO_LOCAL = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/;
const HAS_OFFSET = /(?:Z|[+-]\d{2}:?\d{2})$/i;

/** Milliseconds to add to an instant to get the wall-clock reading in `timeZone`. */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);

  const get = (type: Intl.DateTimeFormatPartTypes): number =>
    Number.parseInt(parts.find((p) => p.type === type)?.value ?? "0", 10);

  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return asUtc - instant.getTime();
}

/**
 * Reads a time the way a person said it. Strings that already carry an offset or `Z` are absolute
 * and pass straight through; a bare `2026-08-01T21:00` is wall-clock time in `timeZone`. A
 * date-only string is midnight local.
 *
 * Returns null rather than an Invalid Date, so callers have one thing to check.
 */
export function parseZonedTime(input: string, timeZone: string): Date | null {
  const text = input?.trim();
  if (!text) {
    return null;
  }

  if (HAS_OFFSET.test(text)) {
    const absolute = new Date(text);
    return Number.isNaN(absolute.getTime()) ? null : absolute;
  }

  const m = ISO_LOCAL.exec(text);
  if (!m) {
    const fallback = new Date(text);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  }

  const [, y, mo, d, h = "00", mi = "00", s = "00"] = m;
  const naiveUtc = Date.UTC(
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(h),
    Number(mi),
    Number(s),
  );
  if (Number.isNaN(naiveUtc)) {
    return null;
  }

  let offset: number;
  try {
    offset = zoneOffsetMs(new Date(naiveUtc), timeZone);
  } catch {
    return new Date(naiveUtc);
  }

  const firstGuess = new Date(naiveUtc - offset);
  const refined = zoneOffsetMs(firstGuess, timeZone);
  return refined === offset ? firstGuess : new Date(naiveUtc - refined);
}

/** `YYYY-MM-DD` for an instant, read in `timeZone`. */
export function localDateKey(instant: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(instant);
  } catch {
    return instant.toISOString().slice(0, 10);
  }
}

/** Start of a local calendar day (`YYYY-MM-DD`) as an instant. */
export function startOfLocalDay(dateKey: string, timeZone: string): Date | null {
  return parseZonedTime(`${dateKey}T00:00:00`, timeZone);
}

/** Start of the day `days` after `dateKey`, i.e. an exclusive range end. */
export function endOfLocalDay(dateKey: string, timeZone: string, days = 1): Date | null {
  const start = startOfLocalDay(dateKey, timeZone);
  if (!start) {
    return null;
  }
  const naive = new Date(`${dateKey}T00:00:00Z`);
  naive.setUTCDate(naive.getUTCDate() + days);
  return startOfLocalDay(naive.toISOString().slice(0, 10), timeZone);
}

/** "Sat 1 Aug 21:00" — how a time is shown back to the user. */
export function formatZonedDateTime(instant: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone,
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .format(instant)
      .replace(",", "");
  } catch {
    return instant.toISOString();
  }
}

/** "21:00" in the given zone. */
export function formatZonedTimeOfDay(instant: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(instant);
  } catch {
    return instant.toISOString().slice(11, 16);
  }
}
