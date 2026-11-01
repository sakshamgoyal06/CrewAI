/** Local weekday helpers for rhythm proactive kinds. */

const WEEKDAY_MAP: Record<string, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

export function localWeekdayShort(now: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short" })
    .format(now)
    .toLowerCase()
    .slice(0, 3);
}

export function localWeekdayIndex(now: Date, timezone: string): number {
  return WEEKDAY_MAP[localWeekdayShort(now, timezone)] ?? now.getUTCDay();
}

export function isLocalWeekday(now: Date, timezone: string, weekday: "mon" | "fri" | "sun"): boolean {
  return localWeekdayShort(now, timezone) === weekday;
}

export function isFirstDayOfMonth(now: Date, timezone: string): boolean {
  const day = new Intl.DateTimeFormat("en-US", { timeZone: timezone, day: "numeric" }).format(now);
  return day === "1";
}
