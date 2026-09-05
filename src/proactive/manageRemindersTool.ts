/**
 * Magnus tool: task reminders — list, create, update, snooze, cancel.
 * Standalone reminders live in custom_reminder subscriptions; commitment reminders use magnus_events.remind_at.
 */
import { zonedTimeToInstant } from "../events/eventTime.js";
import { updateEvent } from "../events/eventStore.js";
import { parseDaysOfWeek, parseReminderTime } from "./parseReminderTime.js";
import {
  formatReminderList,
  listUpcomingReminders,
  matchRemindersByQuery,
  type ReminderRow,
} from "./reminderStore.js";
import {
  createCustomReminder,
  createRecurringCustomReminder,
  createWeeklyCustomReminder,
  deleteSubscription,
  snoozeCustomReminder,
  updateCustomReminder,
} from "./subscriptions/store.js";

function resolveTarget(
  rows: ReminderRow[],
  input: { reminder_id?: string; reminder_kind?: string; query?: string },
): ReminderRow | { error: string } {
  if (input.reminder_id?.trim()) {
    const id = input.reminder_id.trim();
    const byId = rows.find((r) => r.id === id || r.id.startsWith(id));
    if (byId) {
      return byId;
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

  const matched = input.query?.trim()
    ? matchRemindersByQuery(pool, input.query)
    : pool;

  if (matched.length === 0) {
    return { error: "No matching reminder found." };
  }
  if (matched.length > 1) {
    return {
      error: `Multiple reminders match — be more specific:\n${formatReminderList(matched, "UTC")}`,
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

export async function manageReminders(input: {
  userProfileId: string;
  timezone: string;
  action: string;
  message?: string;
  at?: string;
  local_hour?: number;
  local_minute?: number;
  days_of_week?: string;
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

    const days = parseDaysOfWeek(input.days_of_week);
    if (days && days.length > 0) {
      const res = await createWeeklyCustomReminder({
        userProfileId: input.userProfileId,
        message,
        daysOfWeek: days,
        localHour: input.local_hour,
        localMinute: input.local_minute,
      });
      if (!res.ok) {
        return `Could not create weekly reminder: ${res.error}`;
      }
      const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const label = days.map((d) => dayNames[d]).join(", ");
      return `Weekly reminder on ${label} at ~${input.local_hour}:00 your time: "${message}"`;
    }

    const res = await createRecurringCustomReminder({
      userProfileId: input.userProfileId,
      message,
      localHour: input.local_hour,
      localMinute: input.local_minute,
    });
    if (!res.ok) {
      return `Could not create recurring reminder: ${res.error}`;
    }
    return `Daily reminder at ~${input.local_hour}:00 your time: "${message}"`;
  }

  if (action === "update") {
    const rows = await listUpcomingReminders({
      userProfileId: input.userProfileId,
      timezone: input.timezone,
      now,
    });
    const target = resolveTarget(rows, input);
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
      if (patch.remindAt === undefined) {
        return "new_at is required to reschedule a commitment reminder.";
      }
      const res = await updateEvent({
        userProfileId: input.userProfileId,
        eventId: target.id,
        remindAt: patch.remindAt,
      });
      if (!res.ok) {
        return `Could not update reminder: ${res.error}`;
      }
      return `Commitment reminder moved to ${patch.remindAt.toISOString()}.`;
    }

    const at = input.new_at?.trim() ? parseAt(input.new_at, input.timezone) : undefined;
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
    const target = resolveTarget(rows, input);
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
    const target = resolveTarget(rows, input);
    if ("error" in target) {
      return target.error;
    }

    if (target.kind === "event") {
      const res = await updateEvent({
        userProfileId: input.userProfileId,
        eventId: target.id,
        remindAt: null,
      });
      if (!res.ok) {
        return `Could not cancel reminder: ${res.error}`;
      }
      return `Cancelled commitment reminder for "${target.title}".`;
    }

    const res = await deleteSubscription(input.userProfileId, target.id);
    if (!res.ok) {
      return res.error;
    }
    return res.data.deleted ? `Cancelled reminder "${target.title}".` : "Reminder not found.";
  }

  return [
    "Unknown action. Use: list | create | create_recurring | update | snooze | cancel",
    "Task reminders only — for evening journal / rhythm nudges use manage_proactive_messages.",
  ].join("\n");
}
