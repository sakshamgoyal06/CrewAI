/**
 * Parse the locked weekly gym schedule from program memory and return today's session.
 */
const WEEKDAY_HEADERS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

const GYM_ROW_RE = /^\|\s*\*\*Gym AM\*\*\s*\|/i;

function parseGymRow(line: string): string[] | null {
  if (!GYM_ROW_RE.test(line)) {
    return null;
  }
  const cells = line
    .split("|")
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
  // First cell is label "Gym AM"; next 7 are Mon–Sun
  if (cells.length < 8) {
    return null;
  }
  return cells.slice(1, 8);
}

/**
 * Returns the scheduled gym session label for a weekday (0 = Sunday … 6 = Saturday).
 */
export function scheduledGymSessionForWeekday(
  weeklyScheduleMarkdown: string,
  weekday: number,
): string | null {
  if (weekday < 0 || weekday > 6) {
    return null;
  }
  const lines = weeklyScheduleMarkdown.split("\n");
  for (const line of lines) {
    const cells = parseGymRow(line);
    if (!cells) {
      continue;
    }
    // Table columns are Mon → Sun (see weekly-schedule.md), not Sun-first.
    const col = weekday === 0 ? 6 : weekday - 1;
    const session = cells[col]?.replace(/\*\*/g, "").trim();
    return session || null;
  }
  return null;
}

export function formatScheduledGymBlock(input: {
  weeklyScheduleMarkdown: string;
  now: Date;
  timeZone: string;
}): string {
  const weekday = weekdayInTimeZone(input.now, input.timeZone);
  const session = scheduledGymSessionForWeekday(input.weeklyScheduleMarkdown, weekday);
  if (!session) {
    return "";
  }
  const dayName = WEEKDAY_HEADERS[weekday]?.toUpperCase() ?? "?";
  return (
    `\n\n**Locked weekly schedule (authoritative):** Today (${dayName}) = **${session}**. ` +
    `Recommend this unless recovery rules in program memory explicitly override (fatigue gate, not discipline skip).`
  );
}

function weekdayInTimeZone(date: Date, timeZone: string): number {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
    }).formatToParts(date);
    const wd = parts.find((p) => p.type === "weekday")?.value?.toLowerCase();
    const idx = WEEKDAY_HEADERS.indexOf((wd ?? "") as (typeof WEEKDAY_HEADERS)[number]);
    return idx >= 0 ? idx : date.getUTCDay();
  } catch {
    return date.getUTCDay();
  }
}
