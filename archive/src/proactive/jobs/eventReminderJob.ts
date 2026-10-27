import { formatInstant } from "../../events/eventTime.js";
import { logger } from "../../logger.js";
import { supabase } from "../../tools/clients.js";
import { eventReminderJobEnabled, eventReminderLookbackMinutes } from "../env.js";
import { sendProactiveTelegram } from "../outbound.js";
import type { ScheduledProactiveJob } from "./types.js";

type DueEventRow = {
  id: string;
  user_profile_id: string;
  title: string;
  details: string | null;
  time_zone: string;
  planned_start_at: string | null;
};

function buildReminderPlain(row: DueEventRow): string {
  const title = row.title.trim() || "Commitment";
  let body = `Reminder: **${title}**`;
  if (row.planned_start_at) {
    const when = formatInstant(new Date(row.planned_start_at), row.time_zone || "UTC");
    body += `\nPlanned: ${when}`;
  }
  const details = row.details?.trim();
  if (details) {
    body += `\n\n${details}`;
  }
  return body;
}

export const eventReminderScheduledJob: ScheduledProactiveJob = {
  id: "event_reminder",
  enabled: eventReminderJobEnabled,
  async run({ now }) {
    const lookbackMin = eventReminderLookbackMinutes();
    const from = new Date(now.getTime() - lookbackMin * 60 * 1000);

    const { data: events, error } = await supabase
      .from("magnus_events")
      .select("id, user_profile_id, title, details, time_zone, planned_start_at, remind_at")
      .not("remind_at", "is", null)
      .lte("remind_at", now.toISOString())
      .gte("remind_at", from.toISOString())
      .is("reminded_at", null)
      .in("status", ["planned", "in_progress"])
      .limit(50);

    if (error) {
      logger.warn({ err: error.message }, "event reminder query failed");
      return;
    }

    if (!events?.length) {
      return;
    }

    const profileIds = [...new Set(events.map((e) => e.user_profile_id as string))];
    const { data: profiles, error: profErr } = await supabase
      .from("user_profile")
      .select("id, telegram_chat_id, allowlisted")
      .in("id", profileIds)
      .eq("allowlisted", true);

    if (profErr) {
      logger.warn({ err: profErr.message }, "event reminder profile query failed");
      return;
    }

    const chatByProfile = new Map<string, string>();
    for (const p of profiles ?? []) {
      const chat = (p.telegram_chat_id as string | null)?.trim();
      if (chat) {
        chatByProfile.set(p.id as string, chat);
      }
    }

    for (const raw of events) {
      const userProfileId = raw.user_profile_id as string;
      const chatId = chatByProfile.get(userProfileId);
      if (!chatId) {
        continue;
      }

      const row: DueEventRow = {
        id: raw.id as string,
        user_profile_id: userProfileId,
        title: raw.title as string,
        details: raw.details as string | null,
        time_zone: (raw.time_zone as string) || "UTC",
        planned_start_at: raw.planned_start_at as string | null,
      };

      const plain = buildReminderPlain(row);
      try {
        await sendProactiveTelegram({
          chatId,
          telegramUserIdForLog: chatId,
          userProfileId,
          plainText: plain,
          kind: "event_reminder",
          trigger: "event_reminder",
          intent: "event_reminder",
        });

        const { error: updErr } = await supabase
          .from("magnus_events")
          .update({ reminded_at: now.toISOString() })
          .eq("id", row.id)
          .is("reminded_at", null);

        if (updErr) {
          logger.warn(
            { err: updErr.message, eventId: row.id },
            "event reminder: reminded_at update failed",
          );
        }
      } catch (err) {
        logger.error({ err: String(err), eventId: row.id }, "event reminder send failed");
      }
    }
  },
};
