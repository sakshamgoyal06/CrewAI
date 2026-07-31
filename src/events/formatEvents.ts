/**
 * Event rows as plain text for the model — the same choice the calendar tool makes: prose reads
 * better in a reply and costs fewer tokens than JSON.
 *
 * Ids appear in tool output because acting on an event requires having read it first. They are for
 * the model; the system prompt forbids showing them to the user.
 */
import {
  formatInstant,
  formatMinutes,
  formatMinuteOfDay,
} from "./eventTime.js";
import type { ActivityStatsRow } from "./eventStore.js";
import type { EventRow } from "./eventTypes.js";

function whenText(row: EventRow, timeZone: string): string {
  const tz = row.time_zone || timeZone;
  if (!row.planned_start_at) {
    return "no time set";
  }
  const start = new Date(row.planned_start_at);
  if (row.all_day) {
    return `${formatInstant(start, tz, { dateOnly: true })} (all day)`;
  }
  const startText = formatInstant(start, tz);
  if (!row.planned_end_at) {
    return startText;
  }
  const end = new Date(row.planned_end_at);
  const endText = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(end);
  return `${startText}–${endText}`;
}

function isOverdue(row: EventRow, now: Date): boolean {
  if (row.status !== "planned" && row.status !== "in_progress") {
    return false;
  }
  const due = row.planned_end_at ?? row.planned_start_at;
  return due ? new Date(due).getTime() < now.getTime() : false;
}

function actualText(row: EventRow, timeZone: string): string {
  const tz = row.time_zone || timeZone;
  const bits: string[] = [];
  if (row.started_at) {
    bits.push(`started ${formatInstant(new Date(row.started_at), tz)}`);
  }
  if (row.actual_minutes !== null && row.actual_minutes !== undefined) {
    bits.push(`took ${formatMinutes(row.actual_minutes)}`);
  }
  if (row.start_delay_minutes !== null && row.start_delay_minutes !== undefined) {
    const delay = Math.round(Number(row.start_delay_minutes));
    if (delay >= 10) {
      bits.push(`${formatMinutes(delay)} late`);
    } else if (delay <= -10) {
      bits.push(`${formatMinutes(Math.abs(delay))} early`);
    }
  }
  return bits.join(", ");
}

/** One line per event, carrying everything needed to act on it. */
export function formatEventLine(
  row: EventRow,
  timeZone: string,
  options?: { now?: Date; withId?: boolean },
): string {
  const now = options?.now ?? new Date();
  const parts = [`${whenText(row, timeZone)} — ${row.title}`];

  const flags: string[] = [row.status];
  if (isOverdue(row, now)) {
    flags.push("overdue");
  }
  if (row.reschedule_count > 0) {
    flags.push(`moved ${row.reschedule_count}×`);
  }
  parts.push(`[${row.pillar}] (${flags.join(", ")})`);

  const actual = actualText(row, timeZone);
  if (actual) {
    parts.push(actual);
  }
  if (row.reason?.trim()) {
    parts.push(`reason: ${row.reason.trim()}`);
  }
  if (row.outcome_note?.trim()) {
    parts.push(`note: ${row.outcome_note.trim()}`);
  }
  if (row.details?.trim()) {
    parts.push(row.details.trim().slice(0, 200));
  }

  const line = parts.join(" · ");
  return options?.withId === false ? `- ${line}` : `- ${line} [id: ${row.id}]`;
}

export function formatEventList(
  rows: EventRow[],
  timeZone: string,
  options?: { now?: Date; withId?: boolean; empty?: string },
): string {
  if (rows.length === 0) {
    return options?.empty ?? "No events logged for that.";
  }
  return rows.map((r) => formatEventLine(r, timeZone, options)).join("\n");
}

/** Confirmation text after a write: what is now recorded, in one sentence. */
export function describeEvent(row: EventRow, timeZone: string): string {
  const when = whenText(row, timeZone);
  const actual = actualText(row, timeZone);
  const tail = actual ? ` (${actual})` : "";
  return `"${row.title}" — ${when}, ${row.status}${tail} [id: ${row.id}]`;
}

/** The whole life of one commitment: planned, moved, moved again, finally done. */
export function formatEventChain(rows: EventRow[], timeZone: string): string {
  if (rows.length === 0) {
    return "No history for that event.";
  }
  const steps = rows.map((row) => {
    const when = whenText(row, timeZone);
    const why = row.reason?.trim() ? ` — ${row.reason.trim()}` : "";
    return `${when}: ${row.status}${why}`;
  });
  return steps.join("\n→ ");
}

function percent(part: number, whole: number): string {
  if (whole <= 0) {
    return "—";
  }
  return `${Math.round((part / whole) * 100)}%`;
}

/** Adherence per activity: the numbers behind "you keep pushing this one". */
export function formatActivityStats(rows: ActivityStatsRow[]): string {
  if (rows.length === 0) {
    return "Not enough history yet to see a rhythm.";
  }
  return rows
    .map((r) => {
      const bits = [
        `${r.total} logged`,
        `${r.done_count + r.partial_count} done (${percent(r.done_count + r.partial_count, r.total)})`,
      ];
      if (r.missed_count > 0) {
        bits.push(`${r.missed_count} missed`);
      }
      if (r.skipped_count > 0) {
        bits.push(`${r.skipped_count} skipped`);
      }
      if (r.moved_count > 0) {
        bits.push(`${r.moved_count} moved (${r.postponed_count} later, ${r.preponed_count} earlier)`);
      }
      if (r.avg_planned_minute_of_day !== null && r.avg_planned_minute_of_day !== undefined) {
        bits.push(`usually planned for ${formatMinuteOfDay(Number(r.avg_planned_minute_of_day))}`);
      }
      if (r.avg_start_delay_minutes !== null && r.avg_start_delay_minutes !== undefined) {
        const delay = Math.round(Number(r.avg_start_delay_minutes));
        if (Math.abs(delay) >= 5) {
          bits.push(delay > 0 ? `starts ~${formatMinutes(delay)} late` : `starts ~${formatMinutes(Math.abs(delay))} early`);
        }
      }
      if (r.avg_actual_minutes !== null && r.avg_actual_minutes !== undefined) {
        bits.push(`~${formatMinutes(Number(r.avg_actual_minutes))} long`);
      }
      if (r.last_completed_at) {
        bits.push(`last done ${r.last_completed_at.slice(0, 10)}`);
      }
      return `- ${r.activity} [${r.pillar}]: ${bits.join(", ")}`;
    })
    .join("\n");
}
