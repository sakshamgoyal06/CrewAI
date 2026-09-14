/**
 * Overlap and duplicate detection for a day's calendar.
 *
 * A brief once read out "09:00–09:50 — Swimming @ Cult HSR" and "10:00–10:50 — Morning
 * Swimming" as two flat facts. Reading a contradictory calendar back verbatim, every
 * morning, is how an assistant proves it is not paying attention.
 */

export type DayEvent = {
  id?: string;
  title: string;
  /** ISO start; all-day events have no time component. */
  start: string;
  end?: string;
};

export type DayConflict =
  | { kind: "duplicate"; titles: [string, string]; when: string }
  | { kind: "overlap"; titles: [string, string]; when: string };

const FILLER = new Set([
  "the",
  "a",
  "an",
  "my",
  "morning",
  "evening",
  "afternoon",
  "night",
  "session",
  "class",
  "practice",
  "time",
  "slot",
]);

function titleTokens(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !FILLER.has(w)),
  );
}

/** Same activity described two ways — "Swimming" and "Morning Swimming". */
export function looksLikeSameActivity(a: string, b: string): boolean {
  const ta = titleTokens(a);
  const tb = titleTokens(b);
  if (ta.size === 0 || tb.size === 0) {
    return false;
  }
  const smaller = ta.size <= tb.size ? ta : tb;
  const larger = ta.size <= tb.size ? tb : ta;
  let shared = 0;
  for (const token of smaller) {
    if (larger.has(token)) {
      shared += 1;
    }
  }
  return shared === smaller.size;
}

function timeRange(event: DayEvent): { start: number; end: number } | null {
  if (!event.start.includes("T")) {
    return null;
  }
  const start = new Date(event.start).getTime();
  if (Number.isNaN(start)) {
    return null;
  }
  const endRaw = event.end ? new Date(event.end).getTime() : NaN;
  const end = Number.isNaN(endRaw) ? start + 30 * 60 * 1000 : endRaw;
  return { start, end: Math.max(end, start) };
}

function clockLabel(iso: string, timeZone: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) {
    return iso;
  }
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(at);
}

/**
 * Conflicts worth raising, most suspicious first: near-identical activities, then plain
 * double-bookings. A pair is reported once.
 */
export function detectDayConflicts(events: DayEvent[], timeZone: string): DayConflict[] {
  const timed = events
    .map((event) => ({ event, range: timeRange(event) }))
    .filter((row): row is { event: DayEvent; range: { start: number; end: number } } =>
      row.range !== null,
    )
    .sort((a, b) => a.range.start - b.range.start);

  const duplicates: DayConflict[] = [];
  const overlaps: DayConflict[] = [];

  for (let i = 0; i < timed.length; i += 1) {
    for (let j = i + 1; j < timed.length; j += 1) {
      const a = timed[i]!;
      const b = timed[j]!;
      if (a.event.id && b.event.id && a.event.id === b.event.id) {
        continue;
      }
      const sameActivity = looksLikeSameActivity(a.event.title, b.event.title);
      // Two swim sessions an hour apart are still one swim the user entered twice.
      const withinDuplicateWindow = b.range.start - a.range.start <= 2 * 60 * 60 * 1000;
      const overlapping = b.range.start < a.range.end;

      const when = `${clockLabel(a.event.start, timeZone)} and ${clockLabel(b.event.start, timeZone)}`;
      if (sameActivity && withinDuplicateWindow) {
        duplicates.push({
          kind: "duplicate",
          titles: [a.event.title, b.event.title],
          when,
        });
        continue;
      }
      if (overlapping) {
        overlaps.push({ kind: "overlap", titles: [a.event.title, b.event.title], when });
      }
    }
  }

  return [...duplicates, ...overlaps];
}

export function formatDayConflicts(conflicts: DayConflict[]): string {
  if (conflicts.length === 0) {
    return "";
  }
  return conflicts
    .slice(0, 4)
    .map((c) =>
      c.kind === "duplicate"
        ? `- "${c.titles[0]}" (${c.when.split(" and ")[0]}) and "${c.titles[1]}" (${c.when.split(" and ")[1]}) look like the same session entered twice — ask which one is real before treating both as fixed.`
        : `- "${c.titles[0]}" and "${c.titles[1]}" overlap at ${c.when} — a genuine double-booking; say so rather than reading both out.`,
    )
    .join("\n");
}
