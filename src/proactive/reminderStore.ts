/**
 * Query and format upcoming reminders across custom subscriptions and event-log remind_at.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { formatInstant } from "../events/eventTime.js";
import { EVENT_COLUMNS, type EventRow } from "../events/eventTypes.js";
import { supabase as defaultClient } from "../tools/clients.js";
import {
  rowToSubscription,
  type ProactiveSubscription,
  type ProactiveSubscriptionRow,
  type RecurringLocalSchedule,
  type WeeklyLocalSchedule,
} from "./subscriptions/types.js";

const SUBS_TABLE = "magnus_proactive_subscriptions";
const EVENTS_TABLE = "magnus_events";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export type ReminderKind = "standalone" | "event";

export type ReminderRow = {
  kind: ReminderKind;
  id: string;
  title: string;
  at: Date | null;
  scheduleLabel: string | null;
  recurring: boolean;
  eventId?: string;
};

function client(deps?: { client?: SupabaseClient }): SupabaseClient {
  return deps?.client ?? defaultClient;
}

function subscriptionTitle(sub: ProactiveSubscription): string {
  const fromConfig =
    typeof sub.config.message === "string" ? sub.config.message.trim() : "";
  return fromConfig || sub.userInstruction?.trim() || "Reminder";
}

function subscriptionFireAt(sub: ProactiveSubscription): Date | null {
  if (sub.triggerType === "one_shot") {
    if (sub.nextFireAt) {
      return new Date(sub.nextFireAt);
    }
    const sched = sub.schedule as { type?: string; at?: string };
    if (sched?.type === "one_shot" && sched.at) {
      return new Date(sched.at);
    }
    return null;
  }
  return null;
}

function subscriptionScheduleLabel(sub: ProactiveSubscription): string | null {
  const sched = sub.schedule;
  if (!sched || typeof sched !== "object") {
    return null;
  }
  if ((sched as RecurringLocalSchedule).type === "recurring_local") {
    const s = sched as RecurringLocalSchedule;
    const minute = s.localMinute ?? 0;
    const time = `${String(s.localHour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    return `Daily at ${time} local`;
  }
  if ((sched as WeeklyLocalSchedule).type === "weekly_local") {
    const s = sched as WeeklyLocalSchedule;
    const minute = s.localMinute ?? 0;
    const time = `${String(s.localHour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    const days = s.daysOfWeek.map((d) => DAY_LABELS[d] ?? String(d)).join(", ");
    return `${days} at ${time} local`;
  }
  return null;
}

export async function listStandaloneReminders(
  userProfileId: string,
  deps?: { client?: SupabaseClient },
): Promise<ProactiveSubscription[]> {
  const { data, error } = await client(deps)
    .from(SUBS_TABLE)
    .select("*")
    .eq("user_profile_id", userProfileId)
    .eq("kind", "custom_reminder")
    .eq("enabled", true)
    .order("created_at", { ascending: true });

  if (error || !data) {
    return [];
  }
  return (data as ProactiveSubscriptionRow[]).map(rowToSubscription);
}

export async function listPendingEventReminders(
  userProfileId: string,
  now: Date,
  deps?: { client?: SupabaseClient },
): Promise<EventRow[]> {
  const { data, error } = await client(deps)
    .from(EVENTS_TABLE)
    .select(EVENT_COLUMNS)
    .eq("user_profile_id", userProfileId)
    .not("remind_at", "is", null)
    .is("reminded_at", null)
    .in("status", ["planned", "in_progress"])
    .gte("remind_at", new Date(now.getTime() - 60 * 60 * 1000).toISOString())
    .order("remind_at", { ascending: true })
    .limit(50);

  if (error || !data) {
    return [];
  }
  return data as unknown as EventRow[];
}

export async function listUpcomingReminders(
  input: { userProfileId: string; timezone: string; now?: Date },
  deps?: { client?: SupabaseClient },
): Promise<ReminderRow[]> {
  const now = input.now ?? new Date();
  const [standalone, events] = await Promise.all([
    listStandaloneReminders(input.userProfileId, deps),
    listPendingEventReminders(input.userProfileId, now, deps),
  ]);

  const rows: ReminderRow[] = [];

  for (const sub of standalone) {
    rows.push({
      kind: "standalone",
      id: sub.id,
      title: subscriptionTitle(sub),
      at: subscriptionFireAt(sub),
      scheduleLabel: subscriptionScheduleLabel(sub),
      recurring: sub.triggerType === "recurring",
    });
  }

  for (const ev of events) {
    rows.push({
      kind: "event",
      id: ev.id,
      eventId: ev.id,
      title: ev.title.trim() || "Commitment",
      at: ev.remind_at ? new Date(ev.remind_at) : null,
      scheduleLabel: null,
      recurring: false,
    });
  }

  rows.sort((a, b) => {
    if (a.at && b.at) {
      return a.at.getTime() - b.at.getTime();
    }
    if (a.at) {
      return -1;
    }
    if (b.at) {
      return 1;
    }
    return a.title.localeCompare(b.title);
  });

  return rows;
}

export function matchRemindersByQuery(
  rows: ReminderRow[],
  query: string,
): ReminderRow[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return rows;
  }
  const tokens = q.split(/\s+/).filter(Boolean);
  return rows.filter((row) => {
    const hay = row.title.toLowerCase();
    return tokens.every((t) => hay.includes(t));
  });
}

export function formatReminderLine(
  row: ReminderRow,
  timezone: string,
  options?: { includeId?: boolean },
): string {
  const when = row.at
    ? formatInstant(row.at, timezone)
    : row.scheduleLabel ?? "recurring";
  const tag = row.kind === "event" ? "commitment" : "reminder";
  const idSuffix = options?.includeId !== false ? ` [${row.kind}:${row.id.slice(0, 8)}]` : "";
  return `- (${tag}) ${when} — ${row.title}${idSuffix}`;
}

export function formatReminderList(
  rows: ReminderRow[],
  timezone: string,
): string {
  if (rows.length === 0) {
    return "No upcoming reminders.";
  }
  return `Upcoming reminders:\n${rows.map((r) => formatReminderLine(r, timezone)).join("\n")}`;
}

export async function getStandaloneReminderById(
  userProfileId: string,
  subscriptionId: string,
  deps?: { client?: SupabaseClient },
): Promise<ProactiveSubscription | null> {
  const { data, error } = await client(deps)
    .from(SUBS_TABLE)
    .select("*")
    .eq("user_profile_id", userProfileId)
    .eq("id", subscriptionId)
    .eq("kind", "custom_reminder")
    .maybeSingle();

  if (error || !data) {
    return null;
  }
  return rowToSubscription(data as ProactiveSubscriptionRow);
}
