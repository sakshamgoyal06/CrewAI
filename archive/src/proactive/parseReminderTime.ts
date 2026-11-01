import { localDateKey, zonedTimeToInstant } from "../events/eventTime.js";

const WEEKDAY_NAMES: Record<string, number> = {
  sunday: 0,
  sun: 0,
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  tues: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  thur: 4,
  thurs: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
};

/** Parse user-facing reminder times in the user's timezone. */
export function parseReminderTime(
  raw: string,
  timeZone: string,
  now: Date = new Date(),
): Date | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  const lower = trimmed.toLowerCase();

  const inRel = lower.match(/^in\s+(\d+)\s*(min(?:ute)?s?|hrs?|hours?)$/);
  if (inRel) {
    const n = Number.parseInt(inRel[1] ?? "0", 10);
    if (!Number.isFinite(n) || n <= 0) {
      return null;
    }
    const unit = inRel[2] ?? "";
    const ms = unit.startsWith("h") ? n * 60 * 60 * 1000 : n * 60 * 1000;
    return new Date(now.getTime() + ms);
  }

  if (lower === "tonight" || lower === "this evening") {
    return buildLocalDateTime(now, timeZone, { hour: 21, minute: 0 }, 0, now);
  }

  const monthsAhead = lower.match(
    /^(\d+)\s+months?\s+from\s+today\s+on\s+the\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s+of\s+that\s+month)?$/,
  );
  if (monthsAhead) {
    const months = Number.parseInt(monthsAhead[1] ?? "0", 10);
    const day = Number.parseInt(monthsAhead[2] ?? "0", 10);
    if (months > 0 && day >= 1 && day <= 31) {
      const base = addCalendarMonths(now, timeZone, months);
      const dateKey = localDateKey(base, timeZone).replace(/-\d{2}$/, `-${String(day).padStart(2, "0")}`);
      return zonedTimeToInstant(`${dateKey}T09:00:00`, timeZone);
    }
  }

  const weekdayMatch = findWeekdayInText(lower);
  if (weekdayMatch !== null) {
    const clock = parseClockPhrase(lower) ?? defaultClockForTimeOfDay(lower);
    const forceNext = /\bnext\b/.test(lower);
    const dayOffset = daysUntilWeekday(now, timeZone, weekdayMatch, forceNext, clock);
    return buildLocalDateTime(now, timeZone, clock, dayOffset, now);
  }

  const clock = parseClockPhrase(lower);
  if (clock && (lower.includes("tomorrow") || lower.includes("today"))) {
    const baseKey = localDateKey(now, timeZone);
    let dateKey = baseKey;
    if (lower.includes("tomorrow")) {
      const base = zonedTimeToInstant(`${baseKey}T12:00:00`, timeZone);
      if (!base) {
        return null;
      }
      const next = new Date(base.getTime() + 24 * 60 * 60 * 1000);
      dateKey = localDateKey(next, timeZone);
    }
    const hh = String(clock.hour).padStart(2, "0");
    const mm = String(clock.minute).padStart(2, "0");
    const at = zonedTimeToInstant(`${dateKey}T${hh}:${mm}:00`, timeZone);
    if (at && at.getTime() <= now.getTime() && lower.includes("today")) {
      return null;
    }
    return at;
  }

  if (clock && /\bmorning\b/.test(lower) && !lower.includes("tomorrow") && !lower.includes("today")) {
    const dayOffset = lower.includes("tomorrow") ? 1 : 0;
    return buildLocalDateTime(now, timeZone, { hour: 9, minute: 0 }, dayOffset, now);
  }

  return zonedTimeToInstant(trimmed, timeZone);
}

/** Parse comma-separated weekday names or numbers (0=Sun) into sorted unique indices. */
export function parseDaysOfWeek(raw: string | undefined): number[] | null {
  if (!raw?.trim()) {
    return null;
  }
  const parts = raw
    .split(/[,;\s]+/)
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);
  if (parts.length === 0) {
    return null;
  }
  const days = new Set<number>();
  for (const part of parts) {
    if (/^\d$/.test(part)) {
      const n = Number.parseInt(part, 10);
      if (n >= 0 && n <= 6) {
        days.add(n);
      }
      continue;
    }
    const mapped = WEEKDAY_NAMES[part];
    if (mapped !== undefined) {
      days.add(mapped);
    }
  }
  return days.size > 0 ? [...days].sort((a, b) => a - b) : null;
}

function findWeekdayInText(text: string): number | null {
  for (const [name, idx] of Object.entries(WEEKDAY_NAMES)) {
    const re = new RegExp(`\\b(?:on\\s+|this\\s+|next\\s+)?${name}\\b`);
    if (re.test(text)) {
      return idx;
    }
  }
  return null;
}

function defaultClockForTimeOfDay(text: string): { hour: number; minute: number } {
  if (/\bmorning\b/.test(text)) {
    return { hour: 9, minute: 0 };
  }
  if (/\bafternoon\b/.test(text)) {
    return { hour: 14, minute: 0 };
  }
  if (/\b(evening|night)\b/.test(text)) {
    return { hour: 18, minute: 0 };
  }
  return { hour: 9, minute: 0 };
}

function parseClockPhrase(text: string): { hour: number; minute: number } | null {
  const m = text.match(/(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (!m) {
    return null;
  }
  let hour = Number.parseInt(m[1] ?? "0", 10);
  const minute = Number.parseInt(m[2] ?? "0", 10);
  const ampm = m[3]?.toLowerCase();
  if (ampm === "pm" && hour < 12) {
    hour += 12;
  }
  if (ampm === "am" && hour === 12) {
    hour = 0;
  }
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }
  return { hour, minute };
}

function buildLocalDateTime(
  now: Date,
  timeZone: string,
  clock: { hour: number; minute: number },
  dayOffset: number,
  notBefore: Date,
): Date | null {
  const baseKey = localDateKey(now, timeZone);
  const base = zonedTimeToInstant(`${baseKey}T12:00:00`, timeZone);
  if (!base) {
    return null;
  }
  const target = new Date(base.getTime() + dayOffset * 24 * 60 * 60 * 1000);
  const dateKey = localDateKey(target, timeZone);
  const hh = String(clock.hour).padStart(2, "0");
  const mm = String(clock.minute).padStart(2, "0");
  const at = zonedTimeToInstant(`${dateKey}T${hh}:${mm}:00`, timeZone);
  if (!at || at.getTime() <= notBefore.getTime()) {
    return null;
  }
  return at;
}

function daysUntilWeekday(
  now: Date,
  timeZone: string,
  targetDow: number,
  forceNext: boolean,
  clock: { hour: number; minute: number },
): number {
  const currentDow = localDayOfWeek(now, timeZone);
  let offset = (targetDow - currentDow + 7) % 7;
  if (offset === 0 && forceNext) {
    offset = 7;
  }
  if (offset === 0) {
    const todayAt = buildLocalDateTime(now, timeZone, clock, 0, new Date(0));
    if (todayAt && todayAt.getTime() <= now.getTime()) {
      offset = 7;
    }
  }
  return offset;
}

function localDayOfWeek(at: Date, timeZone: string): number {
  const short = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" })
    .format(at)
    .toLowerCase()
    .slice(0, 3);
  const map: Record<string, number> = {
    sun: 0,
    mon: 1,
    tue: 2,
    wed: 3,
    thu: 4,
    fri: 5,
    sat: 6,
  };
  return map[short] ?? at.getUTCDay();
}

function addCalendarMonths(from: Date, timeZone: string, months: number): Date {
  const key = localDateKey(from, timeZone);
  const [y, m, d] = key.split("-").map((n) => Number.parseInt(n, 10));
  const targetMonth = m - 1 + months;
  const targetYear = y + Math.floor(targetMonth / 12);
  const normalizedMonth = ((targetMonth % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, normalizedMonth + 1, 0)).getUTCDate();
  const day = Math.min(d, lastDay);
  const dateKey = `${targetYear}-${String(normalizedMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return zonedTimeToInstant(`${dateKey}T12:00:00`, timeZone) ?? from;
}
