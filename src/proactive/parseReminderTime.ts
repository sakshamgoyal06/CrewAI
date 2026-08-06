import { localDateKey, zonedTimeToInstant } from "../events/eventTime.js";

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
    return zonedTimeToInstant(`${dateKey}T${hh}:${mm}:00`, timeZone);
  }

  return zonedTimeToInstant(trimmed, timeZone);
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
