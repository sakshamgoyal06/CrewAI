/**
 * Shapes for `magnus_events` — the master log of what was planned and what happened.
 * @see supabase/migrations/20260801120000_magnus_events.sql
 */

export const EVENT_STATUSES = [
  "planned",
  "in_progress",
  "done",
  "partial",
  "skipped",
  "missed",
  "cancelled",
  "postponed",
  "preponed",
] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

/** Statuses a caller may set directly. The two reschedule outcomes are written by the database. */
export const SETTABLE_EVENT_STATUSES = [
  "planned",
  "in_progress",
  "done",
  "partial",
  "skipped",
  "missed",
  "cancelled",
] as const;
export type SettableEventStatus = (typeof SETTABLE_EVENT_STATUSES)[number];

/** Nothing more will happen to an event in one of these. */
export const OPEN_EVENT_STATUSES = ["planned", "in_progress"] as const;

export const EVENT_PILLARS = ["health", "wealth", "happiness", "wisdom", "general"] as const;
export type EventPillar = (typeof EVENT_PILLARS)[number];

export const EVENT_KINDS = ["event", "task", "habit"] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

export const EVENT_PRIORITIES = ["low", "normal", "high", "critical"] as const;
export type EventPriority = (typeof EVENT_PRIORITIES)[number];

export const EVENT_SOURCES = [
  "telegram",
  "magnus",
  "calendar",
  "journal",
  "system",
  "import",
] as const;
export type EventSource = (typeof EVENT_SOURCES)[number];

export type StatusHistoryEntry = {
  at: string;
  from: EventStatus | null;
  to: EventStatus;
  note: string | null;
};

/** A row as PostgREST returns it. Column names stay snake_case on purpose. */
export type MagnusEventRow = {
  id: string;
  user_profile_id: string;
  title: string;
  details: string | null;
  pillar: EventPillar;
  kind: EventKind;
  activity_key: string | null;
  tags: string[];
  location: string | null;
  priority: EventPriority;
  time_zone: string;
  all_day: boolean;
  planned_start_at: string | null;
  planned_end_at: string | null;
  planned_duration_minutes: number | null;
  planned_local_date: string | null;
  planned_local_time: string | null;
  planned_local_dow: number | null;
  started_at: string | null;
  ended_at: string | null;
  completed_at: string | null;
  actual_local_date: string | null;
  actual_duration_minutes: number | null;
  start_delay_minutes: number | null;
  status: EventStatus;
  status_changed_at: string;
  status_history: StatusHistoryEntry[];
  outcome_note: string | null;
  quality_rating: number | null;
  rescheduled_from_event_id: string | null;
  rescheduled_to_event_id: string | null;
  displaced_by_event_id: string | null;
  root_event_id: string;
  reschedule_count: number;
  reschedule_reason: string | null;
  original_planned_start_at: string | null;
  is_latest: boolean;
  source: EventSource;
  calendar_event_id: string | null;
  calendar_id: string | null;
  daily_log_id: string | null;
  goal_id: string | null;
  reminder_at: string | null;
  reminder_sent_at: string | null;
  metadata: Record<string, unknown>;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

/** One row of `magnus_activity_stats`. */
export type ActivityStatsRow = {
  user_profile_id: string;
  activity_key: string;
  pillar: EventPillar;
  sample_title: string;
  times_planned: number;
  times_done: number;
  times_missed: number;
  times_skipped: number;
  times_cancelled: number;
  times_postponed: number;
  times_preponed: number;
  avg_start_delay_minutes: number | null;
  avg_actual_duration_minutes: number | null;
  avg_quality_rating: number | null;
  usual_local_time: string | null;
  usual_local_dow: number | null;
  last_planned_at: string | null;
  last_done_at: string | null;
};

export type EventWriteResult =
  | { ok: true; event: MagnusEventRow }
  | { ok: false; error: string };

/** Maps the classifier's vocabulary onto the pillar values the table accepts. */
export function toEventPillar(value: string | null | undefined): EventPillar {
  const v = value?.trim().toLowerCase();
  switch (v) {
    case "health":
    case "wealth":
    case "wisdom":
      return v;
    case "happiness":
    case "joy":
      return "happiness";
    default:
      return "general";
  }
}

export function isSettableEventStatus(value: string): value is SettableEventStatus {
  return (SETTABLE_EVENT_STATUSES as readonly string[]).includes(value);
}

export function isEventKind(value: string): value is EventKind {
  return (EVENT_KINDS as readonly string[]).includes(value);
}

export function isEventPriority(value: string): value is EventPriority {
  return (EVENT_PRIORITIES as readonly string[]).includes(value);
}
