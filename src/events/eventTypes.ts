/**
 * Vocabulary of the event log: the statuses a commitment can be in, the pillars it can belong to,
 * and the normalisation that keeps a model's free phrasing ("finished", "bumped it", "happiness")
 * from becoming a constraint violation or a second spelling of the same activity.
 *
 * @see supabase/migrations/20260731120000_magnus_events.sql
 */

export const EVENT_STATUSES = [
  "planned",
  "in_progress",
  "done",
  "partial",
  "skipped",
  "missed",
  "postponed",
  "preponed",
  "rescheduled",
  "cancelled",
] as const;

export type EventStatus = (typeof EVENT_STATUSES)[number];

/** Statuses that mean the row was replaced by a later one; only the reschedule path may set them. */
export const SUPERSEDED_STATUSES: readonly EventStatus[] = ["postponed", "preponed", "rescheduled"];

/** Statuses that mean nothing more will happen to this row. */
export const CLOSED_STATUSES: readonly EventStatus[] = [
  "done",
  "partial",
  "skipped",
  "missed",
  "cancelled",
  ...SUPERSEDED_STATUSES,
];

export const EVENT_PILLARS = ["health", "wealth", "wisdom", "joy", "magnus"] as const;
export type EventPillar = (typeof EVENT_PILLARS)[number];

export const RESCHEDULE_KINDS = ["postponed", "preponed", "rescheduled"] as const;
export type RescheduleKind = (typeof RESCHEDULE_KINDS)[number];

export type EventRow = {
  id: string;
  user_profile_id: string;
  title: string;
  details: string | null;
  pillar: EventPillar;
  activity_key: string | null;
  tags: string[] | null;
  priority: number | null;
  time_zone: string;
  planned_start_at: string | null;
  planned_end_at: string | null;
  planned_minutes: number | null;
  all_day: boolean;
  planned_date: string | null;
  planned_minute_of_day: number | null;
  planned_dow: number | null;
  started_at: string | null;
  ended_at: string | null;
  actual_minutes: number | null;
  completed_at: string | null;
  start_delay_minutes: number | null;
  status: EventStatus;
  status_changed_at: string;
  reason: string | null;
  outcome_note: string | null;
  root_event_id: string;
  reschedule_of: string | null;
  rescheduled_to: string | null;
  reschedule_kind: RescheduleKind | null;
  reschedule_count: number;
  remind_at: string | null;
  google_event_id: string | null;
  daily_log_id: string | null;
  source: string;
  created_by: string;
  created_at: string;
};

/** Columns worth reading; `select("*")` would drag along history and metadata on every list. */
export const EVENT_COLUMNS =
  "id, title, details, pillar, activity_key, tags, priority, time_zone, planned_start_at, " +
  "planned_end_at, planned_minutes, all_day, planned_date, planned_minute_of_day, planned_dow, " +
  "started_at, ended_at, actual_minutes, completed_at, start_delay_minutes, status, " +
  "status_changed_at, reason, outcome_note, root_event_id, reschedule_of, rescheduled_to, " +
  "reschedule_kind, reschedule_count, remind_at, google_event_id, daily_log_id, source, " +
  "created_by, created_at";

const PILLAR_SYNONYMS: Record<string, EventPillar> = {
  health: "health",
  fitness: "health",
  training: "health",
  workout: "health",
  nutrition: "health",
  sleep: "health",
  wealth: "wealth",
  money: "wealth",
  finance: "wealth",
  financial: "wealth",
  investing: "wealth",
  wisdom: "wisdom",
  learning: "wisdom",
  study: "wisdom",
  work: "wisdom",
  career: "wisdom",
  craft: "wisdom",
  joy: "joy",
  happiness: "joy",
  fun: "joy",
  leisure: "joy",
  relationships: "joy",
  magnus: "magnus",
  general: "magnus",
  admin: "magnus",
  other: "magnus",
};

export function normalizePillar(value: string | null | undefined): EventPillar {
  const key = value?.trim().toLowerCase() ?? "";
  return PILLAR_SYNONYMS[key] ?? "magnus";
}

const STATUS_SYNONYMS: Record<string, EventStatus> = {
  plan: "planned",
  planned: "planned",
  scheduled: "planned",
  committed: "planned",
  todo: "planned",
  start: "in_progress",
  started: "in_progress",
  doing: "in_progress",
  in_progress: "in_progress",
  "in progress": "in_progress",
  ongoing: "in_progress",
  done: "done",
  complete: "done",
  completed: "done",
  finished: "done",
  did: "done",
  partial: "partial",
  partially: "partial",
  half: "partial",
  skip: "skipped",
  skipped: "skipped",
  dropped: "skipped",
  missed: "missed",
  miss: "missed",
  "no show": "missed",
  forgot: "missed",
  postponed: "postponed",
  postpone: "postponed",
  delayed: "postponed",
  pushed: "postponed",
  preponed: "preponed",
  prepone: "preponed",
  moved: "rescheduled",
  rescheduled: "rescheduled",
  cancel: "cancelled",
  cancelled: "cancelled",
  canceled: "cancelled",
};

export function normalizeStatus(value: string | null | undefined): EventStatus | null {
  const key = value?.trim().toLowerCase().replace(/-/g, "_") ?? "";
  if (!key) {
    return null;
  }
  return STATUS_SYNONYMS[key] ?? STATUS_SYNONYMS[key.replace(/_/g, " ")] ?? null;
}

export function normalizeRescheduleKind(value: string | null | undefined): RescheduleKind | null {
  const status = normalizeStatus(value);
  if (status && (RESCHEDULE_KINDS as readonly string[]).includes(status)) {
    return status as RescheduleKind;
  }
  return null;
}

const ACTIVITY_STOPWORDS = new Set(["a", "an", "the", "my", "some", "at", "on", "for", "to"]);

/**
 * A stable slug for "the same thing again", so three months of differently-worded AI sessions still
 * group into one rhythm. Stopwords are dropped only when something is left over.
 */
export function activityKeyFor(input: {
  activity?: string | null;
  title: string;
}): string | null {
  const source = input.activity?.trim() || input.title.trim();
  if (!source) {
    return null;
  }
  const words = source
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) {
    return null;
  }
  const kept = words.filter((w) => !ACTIVITY_STOPWORDS.has(w));
  const chosen = kept.length > 0 ? kept : words;
  return chosen.join("_").slice(0, 60) || null;
}
