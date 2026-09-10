/**
 * Post-activity completion check-ins — nudge after planned end + grace, arm completion FSM.
 */
import { sweepMissedEvents } from "../../events/eventStore.js";
import { EVENT_COLUMNS } from "../../events/eventTypes.js";
import { formatInstant } from "../../events/eventTime.js";
import { isGymEvent } from "../../events/gymHevyMatch.js";
import { oneShotReminderMaxLateHours } from "../oneShotReminderExpiry.js";
import {
  markActivityCompletionNudged,
  wasActivityCompletionNudged,
} from "../../logging/activityCompletionPending.js";
import { armActivityCompletionPending } from "../../logging/handleActivityCompletionPending.js";
import { logger } from "../../logger.js";
import { supabase } from "../../tools/clients.js";
import { loadUserIntegrations } from "../../users/userIntegrations.js";
import { claimProactiveDelivery } from "../dedupe.js";
import { activityCompletionJobEnabled, activityCompletionGraceMinutes } from "../env.js";
import { sendProactiveTelegram } from "../outbound.js";
import { listAllowlistedTelegramTargets } from "../targets.js";
import type { ScheduledProactiveJob } from "./types.js";

type DueEventRow = {
  id: string;
  user_profile_id: string;
  title: string;
  time_zone: string;
  planned_start_at: string | null;
  planned_end_at: string | null;
  planned_minutes: number | null;
  google_event_id: string | null;
  activity_key: string | null;
};

function eventEndMs(row: DueEventRow): number | null {
  if (row.planned_end_at) {
    const end = new Date(row.planned_end_at).getTime();
    return Number.isNaN(end) ? null : end;
  }
  if (row.planned_start_at && row.planned_minutes != null && row.planned_minutes > 0) {
    const start = new Date(row.planned_start_at).getTime();
    if (Number.isNaN(start)) {
      return null;
    }
    return start + row.planned_minutes * 60 * 1000;
  }
  if (row.planned_start_at) {
    const start = new Date(row.planned_start_at).getTime();
    return Number.isNaN(start) ? null : start + 60 * 60 * 1000;
  }
  return null;
}

function isDueForCompletionNudge(row: DueEventRow, now: Date, graceMin: number): boolean {
  const endMs = eventEndMs(row);
  if (endMs == null) {
    return false;
  }
  const graceMs = graceMin * 60 * 1000;
  return now.getTime() >= endMs + graceMs;
}

function buildNudgePlain(row: DueEventRow): string {
  const title = row.title.trim() || "Activity";
  const tz = row.time_zone || "UTC";
  const when = row.planned_start_at
    ? formatInstant(new Date(row.planned_start_at), tz)
    : "today";
  return (
    `**${title}** (${when}) — how did it go?\n\n` +
    `Reply **done**, **missed**, **skip**, or **postpone to …** (e.g. tomorrow 8am).`
  );
}

export const activityCompletionScheduledJob: ScheduledProactiveJob = {
  id: "activity_completion",
  enabled: activityCompletionJobEnabled,
  async run({ now }) {
    const graceMin = activityCompletionGraceMinutes();
    const lookbackHours = oneShotReminderMaxLateHours();
    const from = new Date(now.getTime() - lookbackHours * 60 * 60 * 1000);

    const targets = await listAllowlistedTelegramTargets();
    for (const target of targets) {
      const swept = await sweepMissedEvents({
        userProfileId: target.userProfileId,
        graceMinutes: lookbackHours * 60,
        maxAgeDays: 14,
      });
      if (swept.ok && swept.data > 0) {
        logger.info(
          { userProfileId: target.userProfileId, missedCount: swept.data },
          "activity completion: swept stale planned events as missed",
        );
      }
    }

    const { data: events, error } = await supabase
      .from("magnus_events")
      .select(EVENT_COLUMNS)
      .in("status", ["planned", "in_progress"])
      .not("planned_start_at", "is", null)
      .gte("planned_start_at", from.toISOString())
      .lte("planned_start_at", now.toISOString())
      .limit(80);

    if (error) {
      logger.warn({ err: error.message }, "activity completion: events query failed");
      return;
    }

    const due = ((events ?? []) as unknown as DueEventRow[]).filter((row) =>
      isDueForCompletionNudge(row, now, graceMin),
    );
    if (!due.length) {
      return;
    }

    const profileIds = [...new Set(due.map((e) => e.user_profile_id))];
    const { data: profiles, error: profErr } = await supabase
      .from("user_profile")
      .select("id, telegram_chat_id, timezone, allowlisted")
      .in("id", profileIds)
      .eq("allowlisted", true);

    if (profErr) {
      logger.warn({ err: profErr.message }, "activity completion: profile query failed");
      return;
    }

    const profileById = new Map(
      (profiles ?? []).map((p) => [
        p.id as string,
        {
          chatId: (p.telegram_chat_id as string | null)?.trim() ?? "",
          timezone: (p.timezone as string | null)?.trim() || "UTC",
        },
      ]),
    );

    for (const row of due) {
      if (await wasActivityCompletionNudged(row.id)) {
        continue;
      }

      const profile = profileById.get(row.user_profile_id);
      if (!profile?.chatId) {
        continue;
      }

      const integrations = await loadUserIntegrations(row.user_profile_id);
      if (isGymEvent(row) && integrations.hevyApiKey) {
        continue;
      }

      const dedupeKey = `activity_completion:${row.id}`;
      const claimed = await claimProactiveDelivery(dedupeKey, 86400);
      if (!claimed) {
        continue;
      }

      const dateKey = row.planned_start_at
        ? new Intl.DateTimeFormat("en-CA", {
            timeZone: profile.timezone,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          }).format(new Date(row.planned_start_at))
        : now.toISOString().slice(0, 10);

      try {
        await sendProactiveTelegram({
          chatId: profile.chatId,
          telegramUserIdForLog: profile.chatId,
          userProfileId: row.user_profile_id,
          plainText: buildNudgePlain(row),
          kind: "activity_completion",
          trigger: "scheduled",
          intent: "activity_completion",
        });

        await armActivityCompletionPending({
          userProfileId: row.user_profile_id,
          eventId: row.id,
          eventTitle: row.title,
          dateKey,
          timeZone: row.time_zone || profile.timezone,
          googleEventId: row.google_event_id,
        });
        await markActivityCompletionNudged(row.id);
      } catch (err) {
        logger.error({ err: String(err), eventId: row.id }, "activity completion send failed");
      }
    }
  },
};
