/**
 * Gym slot time helpers: local wall-clock times on training days, converted to instants.
 */

export const DEFAULT_CHECK_DELAY_MIN = 180;

export type GymSlot = { time: string | null; checkDelayMin: number };

/** Offset of `timezone` from UTC at `instant`, in ms (positive east of UTC). */
function tzOffsetMs(instant: Date, timezone: string): number {
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
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** The instant of wall-clock `hhmm` on local `date` in `timezone`. */
export function zonedInstant(date: string, hhmm: string, timezone: string): Date {
  const [y, mo, d] = date.split("-").map(Number) as [number, number, number];
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  const wall = Date.UTC(y, mo - 1, d, h, m);
  const first = wall - tzOffsetMs(new Date(wall), timezone);
  // Second pass settles the offset when a DST change falls between the guess and the answer.
  return new Date(wall - tzOffsetMs(new Date(first), timezone));
}

/** "18:30" → "6:30 pm" */
export function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  const suffix = h < 12 ? "am" : "pm";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** Local time the check runs, "HH:MM". */
export function checkTime(slot: GymSlot): string | null {
  if (!slot.time) return null;
  const [h, m] = slot.time.split(":").map(Number) as [number, number];
  const total = (h * 60 + m + slot.checkDelayMin) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
