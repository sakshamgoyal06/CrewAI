/**
 * Magnus tool: manage proactive Telegram subscriptions (evening journal, drift guard, custom reminders).
 */
import { zonedTimeToInstant } from "../events/eventTime.js";
import { parseReminderTime } from "./parseReminderTime.js";
import {
  CATALOG_KIND_LABELS,
  isCatalogKind,
  type CatalogProactiveKind,
} from "./subscriptions/types.js";
import {
  createCustomReminder,
  createRecurringCustomReminder,
  deleteSubscription,
  disableAllSubscriptions,
  listAllSubscriptions,
  setSubscriptionEnabled,
  upsertCatalogSubscription,
} from "./subscriptions/store.js";
import type { RecurringLocalSchedule } from "./subscriptions/types.js";

export async function manageProactiveMessages(input: {
  userProfileId: string;
  timezone: string;
  action: string;
  kind?: string;
  enabled?: boolean;
  local_hour?: number;
  at?: string;
  message?: string;
  user_instruction?: string;
  subscription_id?: string;
  catalog_only?: boolean;
}): Promise<string> {
  const action = input.action.trim().toLowerCase();

  if (action === "list") {
    const subs = await listAllSubscriptions(input.userProfileId);
    if (subs.length === 0) {
      return [
        "No proactive messages configured.",
        "Catalog kinds (opt in with enable): morning_orientation, evening_journal, week_planning, weekly_wrap, monthly_goal_review, drift_guard, midday_encouragement, stale_list_nudge, chat_inactivity, meal_log_reminder, meal_adherence_nudge, meal_eod_reconciliation, meal_gap_nudge, weekly_nutrition_review.",
        "Say enable evening journal at 9pm, or create_reminder with message + at.",
      ].join("\n");
    }
    const lines = subs.map((s) => {
      const label = isCatalogKind(s.kind) ? CATALOG_KIND_LABELS[s.kind] : s.kind;
      const sched =
        (s.schedule as RecurringLocalSchedule)?.type === "recurring_local"
          ? ` @ ${(s.schedule as RecurringLocalSchedule).localHour}:00 local`
          : s.nextFireAt
            ? ` due ${s.nextFireAt}`
            : "";
      return `- ${label} (${s.kind}) [${s.enabled ? "on" : "off"}]${sched} id:${s.id.slice(0, 8)}`;
    });
    return `Proactive messages:\n${lines.join("\n")}`;
  }

  if (action === "enable" || action === "disable") {
    const enabled = action === "enable";
    const kind = input.kind?.trim();
    if (!kind) {
      return "kind is required for enable/disable (e.g. evening_journal, drift_guard).";
    }

    if (isCatalogKind(kind)) {
      const schedulePatch: RecurringLocalSchedule | undefined =
        enabled && input.local_hour != null
          ? {
              type: "recurring_local",
              localHour: Math.min(23, Math.max(0, Math.floor(input.local_hour))),
              windowMinutes: 14,
            }
          : undefined;

      const res = await upsertCatalogSubscription({
        userProfileId: input.userProfileId,
        kind,
        enabled,
        schedule: schedulePatch,
        userInstruction: input.user_instruction,
      });
      if (!res.ok) {
        return `Could not update ${kind}: ${res.error}`;
      }
      const hour =
        schedulePatch?.localHour ??
        ((res.data.schedule as RecurringLocalSchedule)?.localHour ?? "?");
      return enabled
        ? `Enabled ${CATALOG_KIND_LABELS[kind as CatalogProactiveKind]} (~${hour}:00 your time).`
        : `Disabled ${kind}.`;
    }

    const res = await setSubscriptionEnabled({
      userProfileId: input.userProfileId,
      kind,
      subscriptionId: input.subscription_id,
      enabled,
    });
    if (!res.ok) {
      return res.error;
    }
    return `${enabled ? "Enabled" : "Disabled"} ${res.data.kind}.`;
  }

  if (action === "create_reminder") {
    const message = input.message?.trim();
    const atRaw = input.at?.trim();
    if (!message) {
      return "message is required for create_reminder.";
    }
    if (!atRaw) {
      return "at is required (e.g. tomorrow 8pm, 2026-08-07 20:00).";
    }
    const at = parseReminderTime(atRaw, input.timezone) ?? zonedTimeToInstant(atRaw, input.timezone);
    if (!at) {
      return `Could not parse time "${atRaw}" in timezone ${input.timezone}.`;
    }
    if (at.getTime() <= Date.now()) {
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

  if (action === "create_recurring_reminder") {
    const message = input.message?.trim();
    if (!message) {
      return "message is required for create_recurring_reminder.";
    }
    if (input.local_hour == null || Number.isNaN(input.local_hour)) {
      return "local_hour is required (0-23) for create_recurring_reminder.";
    }
    const res = await createRecurringCustomReminder({
      userProfileId: input.userProfileId,
      message,
      localHour: input.local_hour,
    });
    if (!res.ok) {
      return `Could not create recurring reminder: ${res.error}`;
    }
    const hour = (res.data.schedule as RecurringLocalSchedule).localHour ?? input.local_hour;
    return `Daily reminder at ~${hour}:00 your time: "${message}"`;
  }

  if (action === "disable_all") {
    const res = await disableAllSubscriptions(input.userProfileId, {
      catalogOnly: input.catalog_only === true,
    });
    if (!res.ok) {
      return res.error;
    }
    const scope = input.catalog_only ? "catalog proactive messages" : "proactive messages";
    return `Disabled ${res.data.count} ${scope}.`;
  }

  if (action === "delete") {
    if (!input.subscription_id?.trim()) {
      return "subscription_id is required for delete (from list).";
    }
    const res = await deleteSubscription(input.userProfileId, input.subscription_id.trim());
    if (!res.ok) {
      return res.error;
    }
    return res.data.deleted ? "Reminder deleted." : "Subscription not found.";
  }

  return [
    "Unknown action. Use: list | enable | disable | disable_all | create_reminder | create_recurring_reminder | delete",
    "Kinds: morning_orientation, evening_journal, week_planning, weekly_wrap, monthly_goal_review, drift_guard, midday_encouragement, stale_list_nudge, chat_inactivity (catalog); custom_reminder (one-shot or daily).",
  ].join("\n");
}
