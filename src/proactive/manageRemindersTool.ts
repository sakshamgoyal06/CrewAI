/**
 * Magnus tool: task reminders — list, create, update, snooze, cancel.
 * Standalone reminders live in custom_reminder subscriptions; commitment reminders use magnus_events.remind_at.
 */
import { localDateKey, zonedTimeToInstant } from "../events/eventTime.js";
import { updateEvent } from "../events/eventStore.js";
import { parseDaysOfWeek, parseReminderTime } from "./parseReminderTime.js";
import { isSameReminder } from "./reminderMatch.js";
import {
  formatReminderList,
  listUpcomingReminders,
  matchRemindersByQuery,
  type ReminderRow,
} from "./reminderStore.js";
import {
  createCustomReminder,
  createIntervalCustomReminder,
  createRecurringCustomReminder,
  createWeeklyCustomReminder,
  deleteSubscription,
  listEnabledCustomReminders,
  replaceCustomReminderSchedule,
  snoozeCustomReminder,
  updateCustomReminder,
} from "./subscriptions/store.js";
import type { ProactiveSchedule, ProactiveTriggerType } from "./subscriptions/types.js";

function candidateRows(
  rows: ReminderRow[],
  input: { reminder_id?: string; reminder_kind?: string; query?: string },
): ReminderRow[] | { error: string } {
  if (input.reminder_id?.trim()) {
    const id = input.reminder_id.trim();
    const byId = rows.find((r) => r.id === id || r.id.startsWith(id));
    if (byId) {
      return [byId];
    }
    return { error: `No reminder with id starting "${id}".` };
  }

  const kind = input.reminder_kind?.trim().toLowerCase();
  let pool = rows;
  if (kind === "standalone" || kind === "reminder") {
    pool = rows.filter((r) => r.kind === "standalone");
  } else if (kind === "event" || kind === "commitment") {
    pool = rows.filter((r) => r.kind === "event");
  }

  const matched = input.query?.trim() ? matchRemindersByQuery(pool, input.query) : pool;

  if (matched.length === 0) {
    return { error: "No matching reminder found." };
  }
  return matched;
}

/**
 * Matches that are really the same reminder duplicated.
 *
 * The user asked to cancel one reminder; duplicate rows are an internal artefact, so acting on all
 * of them is the only answer that makes sense. Asking which of two identical rows they meant is how
 * the coriander reminder survived a cancel request for three weeks.
 */
function allSameReminder(rows: ReminderRow[]): boolean {
  if (rows.length < 2) {
    return true;
  }
  const [first, ...rest] = rows;
  return rest.every((row) => isSameReminder(first!.title, row.title));
}

function resolveTarget(
  rows: ReminderRow[],
  input: { reminder_id?: string; reminder_kind?: string; query?: string },
  timezone: string,
): ReminderRow | { error: string } {
  const matched = candidateRows(rows, input);
  if ("error" in matched) {
    return matched;
  }
  if (matched.length > 1 && !allSameReminder(matched)) {
    return {
      error: `Multiple reminders match — say which one:\n${formatReminderList(matched, timezone)}`,
    };
  }
  return matched[0]!;
}

function parseAt(raw: string | undefined, timezone: string): Date | null {
  if (!raw?.trim()) {
    return null;
  }
  return parseReminderTime(raw.trim(), timezone) ?? zonedTimeToInstant(raw.trim(), timezone);
}

/** `until` accepts a plain local date or any phrase `parseReminderTime` understands. */
function parseUntilDate(
  raw: string | undefined,
  timezone: string,
): { date: string } | { error: string } | null {
  const trimmed = raw?.trim();
  if (!trimmed) {
    return null;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return { date: trimmed };
  }
  const parsed = parseAt(trimmed, timezone);
  if (!parsed) {
    return { error: `Could not parse until date "${trimmed}".` };
  }
  return { date: localDateKey(parsed, timezone) };
}

/**
 * An existing enabled reminder the new request is really a correction of.
 *
 * Without this, "make that every 2 days" inserted a second row alongside the daily one and the user
 * received both every morning.
 */
async function findExistingReminder(
  userProfileId: string,
  message: string,
): Promise<{ id: string } | null> {
  const existing = await listEnabledCustomReminders(userProfileId);
  for (const sub of existing) {
    const body =
      (typeof sub.config.message === "string" && sub.config.message) || sub.userInstruction || "";
    if (body && isSameReminder(body, message)) {
      return { id: sub.id };
    }
  }
  return null;
}

/** Update the row the user already has instead of stacking a duplicate. */
async function replaceIfDuplicate(input: {
  userProfileId: string;
  message: string;
  schedule: ProactiveSchedule;
  triggerType: ProactiveTriggerType;
  nextFireAt?: Date | null;
}): Promise<{ replaced: true; error?: string } | { replaced: false }> {
  const existing = await findExistingReminder(input.userProfileId, input.message);
  if (!existing) {
    return { replaced: false };
  }
  const res = await replaceCustomReminderSchedule({
    userProfileId: input.userProfileId,
    subscriptionId: existing.id,
    message: input.message,
    schedule: input.schedule,
    triggerType: input.triggerType,
    nextFireAt: input.nextFireAt ?? null,
  });
  return res.ok ? { replaced: true } : { replaced: true, error: res.error };
}

export async function manageReminders(input: {
  userProfileId: string;
  timezone: string;
  action: string;
  message?: string;
  at?: string;
  local_hour?: number;
  local_minute?: number;
  days_of_week?: string;
  interval_days?: number;
  until?: string;
  query?: string;
  reminder_id?: string;
  reminder_kind?: string;
  new_message?: string;
  new_at?: string;
}): Promise<string> {
  const action = input.action.trim().toLowerCase();
  const now = new Date();

  if (action === "list") {
    const rows = await listUpcomingReminders({
      userProfileId: input.userProfileId,
      timezone: input.timezone,
      now,
    });
    const filtered = input.query?.trim()
      ? matchRemindersByQuery(rows, input.query)
      : rows;
    return formatReminderList(filtered, input.timezone);
  }

  if (action === "create") {
    const message = input.message?.trim();
    const atRaw = input.at?.trim();
    if (!message) {
      return "message is required for create.";
    }
    if (!atRaw) {
      return 'at is required (e.g. tomorrow 8pm, Sunday 9:30am, in 30 minutes).';
    }
    const at = parseAt(atRaw, input.timezone);
    if (!at) {
      return `Could not parse time "${atRaw}" in timezone ${input.timezone}.`;
    }
    if (at.getTime() <= now.getTime()) {
      return "Reminder time must be in the future.";
    }

    const replaced = await replaceIfDuplicate({
      userProfileId: input.userProfileId,
      message,
      schedule: { type: "one_shot", at: at.toISOString() },
      triggerType: "one_shot",
      nextFireAt: at,
    });
    if (replaced.replaced) {
      return replaced.error
        ? `Could not update the existing reminder: ${replaced.error}`
        : `Moved your existing "${message}" reminder to ${at.toISOString()} (${input.timezone}) — no duplicate created.`;
    }

    const res = await createCustomReminder({
      userProfileId: input.userProfileId,
      message,
      at,
    });
    if (!res.ok) {
      return `Could not create reminder: ${res.error}`;
    }
    return `Reminder set for ${at.toISOString()} (${input.timezone}): "${message}"`;
  }

  if (action === "create_recurring") {
    const message = input.message?.trim();
    if (!message) {
      return "message is required for create_recurring.";
    }
    if (input.local_hour == null || Number.isNaN(input.local_hour)) {
      return "local_hour is required (0-23) for create_recurring.";
    }

    const parsedUntil = parseUntilDate(input.until, input.timezone);
    if (parsedUntil && "error" in parsedUntil) {
      return parsedUntil.error;
    }
    const until = parsedUntil?.date;
    const untilSuffix = until ? `, until ${until}` : "";
    const timeLabel = `${String(input.local_hour).padStart(2, "0")}:${String(
      input.local_minute ?? 0,
    ).padStart(2, "0")}`;

    const days = parseDaysOfWeek(input.days_of_week);
    if (days && days.length > 0) {
      const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const label = days.map((d) => dayNames[d]).join(", ");
      const schedule: ProactiveSchedule = {
        type: "weekly_local",
        daysOfWeek: days,
        localHour: input.local_hour,
        localMinute: input.local_minute ?? 0,
        windowMinutes: 14,
        ...(until ? { until } : {}),
      };
      const replaced = await replaceIfDuplicate({
        userProfileId: input.userProfileId,
        message,
        schedule,
        triggerType: "recurring",
      });
      if (replaced.replaced) {
        return replaced.error
          ? `Could not update the existing reminder: ${replaced.error}`
          : `Updated your existing "${message}" reminder to ${label} at ${timeLabel} your time${untilSuffix} — no duplicate created.`;
      }
      const res = await createWeeklyCustomReminder({
        userProfileId: input.userProfileId,
        message,
        daysOfWeek: days,
        localHour: input.local_hour,
        localMinute: input.local_minute,
        until,
      });
      if (!res.ok) {
        return `Could not create weekly reminder: ${res.error}`;
      }
      return `Weekly reminder on ${label} at ${timeLabel} your time${untilSuffix}: "${message}"`;
    }

    const intervalDays =
      input.interval_days != null && Number.isFinite(input.interval_days)
        ? Math.max(1, Math.floor(input.interval_days))
        : 1;

    if (intervalDays > 1) {
      const anchorDate = localDateKey(now, input.timezone);
      const schedule: ProactiveSchedule = {
        type: "interval_local",
        intervalDays,
        anchorDate,
        localHour: input.local_hour,
        localMinute: input.local_minute ?? 0,
        windowMinutes: 14,
        ...(until ? { until } : {}),
      };
      const cadence = intervalDays === 2 ? "every other day" : `every ${intervalDays} days`;
      const replaced = await replaceIfDuplicate({
        userProfileId: input.userProfileId,
        message,
        schedule,
        triggerType: "recurring",
      });
      if (replaced.replaced) {
        return replaced.error
          ? `Could not update the existing reminder: ${replaced.error}`
          : `Updated your existing "${message}" reminder to ${cadence} at ${timeLabel} your time${untilSuffix} — no duplicate created.`;
      }
      const res = await createIntervalCustomReminder({
        userProfileId: input.userProfileId,
        message,
        intervalDays,
        anchorDate,
        localHour: input.local_hour,
        localMinute: input.local_minute,
        until,
      });
      if (!res.ok) {
        return `Could not create interval reminder: ${res.error}`;
      }
      return `Reminder ${cadence} at ${timeLabel} your time${untilSuffix}, starting ${anchorDate}: "${message}"`;
    }

    const schedule: ProactiveSchedule = {
      type: "recurring_local",
      localHour: input.local_hour,
      localMinute: input.local_minute ?? 0,
      windowMinutes: 14,
      ...(until ? { until } : {}),
    };
    const replaced = await replaceIfDuplicate({
      userProfileId: input.userProfileId,
      message,
      schedule,
      triggerType: "recurring",
    });
    if (replaced.replaced) {
      return replaced.error
        ? `Could not update the existing reminder: ${replaced.error}`
        : `Updated your existing "${message}" reminder to daily at ${timeLabel} your time${untilSuffix} — no duplicate created.`;
    }

    const res = await createRecurringCustomReminder({
      userProfileId: input.userProfileId,
      message,
      localHour: input.local_hour,
      localMinute: input.local_minute,
      until,
    });
    if (!res.ok) {
      return `Could not create recurring reminder: ${res.error}`;
    }
    return `Daily reminder at ${timeLabel} your time${untilSuffix}: "${message}"`;
  }

  if (action === "update") {
    const rows = await listUpcomingReminders({
      userProfileId: input.userProfileId,
      timezone: input.timezone,
      now,
    });
    const target = resolveTarget(rows, input, input.timezone);
    if ("error" in target) {
      return target.error;
    }

    if (target.kind === "event") {
      const patch: { remindAt?: Date | null } = {};
      if (input.new_at?.trim()) {
        const at = parseAt(input.new_at, input.timezone);
        if (!at) {
          return `Could not parse time "${input.new_at}".`;
        }
        patch.remindAt = at;
      }
      if (input.new_message?.trim()) {
        return "Commitment reminder text comes from the event title — use update_event to change details.";
      }
      if (patch.remindAt == null) {
        return "new_at is required to reschedule a commitment reminder.";
      }
      const remindAt = patch.remindAt;
      const res = await updateEvent({
        userProfileId: input.userProfileId,
        eventId: target.id,
        remindAt,
      });
      if (!res.ok) {
        return `Could not update reminder: ${res.error}`;
      }
      return `Commitment reminder moved to ${remindAt.toISOString()}.`;
    }

    const parsedAt = input.new_at?.trim() ? parseAt(input.new_at, input.timezone) : undefined;
    const at = parsedAt ?? undefined;
    if (at && at.getTime() <= now.getTime()) {
      return "Reminder time must be in the future.";
    }
    const res = await updateCustomReminder({
      userProfileId: input.userProfileId,
      subscriptionId: target.id,
      message: input.new_message,
      at,
    });
    if (!res.ok) {
      return `Could not update reminder: ${res.error}`;
    }
    return "Reminder updated.";
  }

  if (action === "snooze") {
    const atRaw = input.new_at?.trim() || input.at?.trim();
    if (!atRaw) {
      return 'new_at or at is required for snooze (e.g. in 1 hour, tomorrow 9am).';
    }
    const until = parseAt(atRaw, input.timezone);
    if (!until) {
      return `Could not parse snooze time "${atRaw}".`;
    }
    if (until.getTime() <= now.getTime()) {
      return "Snooze time must be in the future.";
    }

    const rows = await listUpcomingReminders({
      userProfileId: input.userProfileId,
      timezone: input.timezone,
      now,
    });
    const target = resolveTarget(rows, input, input.timezone);
    if ("error" in target) {
      return target.error;
    }

    if (target.kind === "event") {
      const res = await updateEvent({
        userProfileId: input.userProfileId,
        eventId: target.id,
        remindAt: until,
      });
      if (!res.ok) {
        return `Could not snooze reminder: ${res.error}`;
      }
      return `Commitment reminder snoozed to ${until.toISOString()}.`;
    }

    const res = await snoozeCustomReminder({
      userProfileId: input.userProfileId,
      subscriptionId: target.id,
      until,
    });
    if (!res.ok) {
      return `Could not snooze reminder: ${res.error}`;
    }
    return `Reminder snoozed to ${until.toISOString()}.`;
  }

  if (action === "cancel") {
    const rows = await listUpcomingReminders({
      userProfileId: input.userProfileId,
      timezone: input.timezone,
      now,
    });
    const matched = candidateRows(rows, input);
    if ("error" in matched) {
      return matched.error;
    }
    if (matched.length > 1 && !allSameReminder(matched)) {
      return `Multiple reminders match — say which one:\n${formatReminderList(matched, input.timezone)}`;
    }

    // Duplicate rows for one reminder all go, so "stop that reminder" actually stops it.
    const cancelled: string[] = [];
    const failures: string[] = [];
    let clearedEventReminder = false;
    for (const target of matched) {
      if (target.kind === "event") {
        const res = await updateEvent({
          userProfileId: input.userProfileId,
          eventId: target.id,
          remindAt: null,
        });
        if (res.ok) {
          cancelled.push(target.title);
          clearedEventReminder = true;
        } else {
          failures.push(res.error);
        }
        continue;
      }
      const res = await deleteSubscription(input.userProfileId, target.id);
      if (res.ok && res.data.deleted) {
        cancelled.push(target.title);
      } else if (!res.ok) {
        failures.push(res.error);
      }
    }

    if (cancelled.length === 0) {
      return failures.length > 0
        ? `Could not cancel reminder: ${failures[0]}`
        : "Reminder not found.";
    }
    const title = cancelled[0]!;
    const dupeNote =
      cancelled.length > 1 ? ` (removed ${cancelled.length} duplicate copies)` : "";
    const failNote = failures.length > 0 ? ` One copy failed: ${failures[0]}` : "";
    // Clearing a commitment's reminder must not read as deleting the commitment.
    const eventNote = clearedEventReminder
      ? " The event stays on your calendar — only the reminder is off."
      : "";
    const label = clearedEventReminder ? "Cancelled commitment reminder for" : "Cancelled reminder";
    return `${label} "${title}"${dupeNote}. It will not fire again.${eventNote}${failNote}`;
  }

  return [
    "Unknown action. Use: list | create | create_recurring | update | snooze | cancel",
    "Task reminders only — for evening journal / rhythm nudges use manage_proactive_messages.",
  ].join("\n");
}
