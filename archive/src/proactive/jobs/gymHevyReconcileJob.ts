import { logger } from "../../logger.js";
import { supabase } from "../../tools/clients.js";
import { loadUserIntegrations } from "../../users/userIntegrations.js";
import { claimProactiveDelivery } from "../dedupe.js";
import { gymHevyReconcileJobEnabled, gymHevyReconcileLookbackDays } from "../env.js";
import { sendProactiveTelegram } from "../outbound.js";
import {
  fetchRecentHevyWorkouts,
  isGymEventDueForHevyReconcile,
  reconcileGymEventWithHevy,
  type GymEventCandidate,
} from "../../events/gymHevyReconcile.js";
import type { ScheduledProactiveJob } from "./types.js";

type ProfileRow = {
  id: string;
  telegram_chat_id: string | null;
  timezone: string | null;
};

async function loadDueGymEvents(now: Date): Promise<GymEventCandidate[]> {
  const lookbackDays = gymHevyReconcileLookbackDays();
  const from = new Date(now.getTime() - lookbackDays * 24 * 60 * 60 * 1000);

  const { data, error } = await supabase
    .from("magnus_events")
    .select(
      "id, user_profile_id, title, time_zone, planned_start_at, status, metadata, external_refs",
    )
    .not("planned_start_at", "is", null)
    .gte("planned_start_at", from.toISOString())
    .lte("planned_start_at", now.toISOString())
    .in("status", ["planned", "in_progress", "missed"])
    .limit(80);

  if (error) {
    logger.warn({ err: error.message }, "gym hevy reconcile: events query failed");
    return [];
  }

  return ((data ?? []) as GymEventCandidate[]).filter((row) => isGymEventDueForHevyReconcile(row, now));
}

export const gymHevyReconcileScheduledJob: ScheduledProactiveJob = {
  id: "gym_hevy_reconcile",
  enabled: gymHevyReconcileJobEnabled,
  async run({ now }) {
    const due = await loadDueGymEvents(now);
    if (!due.length) {
      return;
    }

    const byUser = new Map<string, GymEventCandidate[]>();
    for (const row of due) {
      const list = byUser.get(row.user_profile_id) ?? [];
      list.push(row);
      byUser.set(row.user_profile_id, list);
    }

    const profileIds = [...byUser.keys()];
    const { data: profiles, error: profErr } = await supabase
      .from("user_profile")
      .select("id, telegram_chat_id, timezone, allowlisted")
      .in("id", profileIds)
      .eq("allowlisted", true);

    if (profErr) {
      logger.warn({ err: profErr.message }, "gym hevy reconcile: profile query failed");
      return;
    }

    const profileById = new Map<string, ProfileRow>();
    for (const p of profiles ?? []) {
      profileById.set(p.id as string, {
        id: p.id as string,
        telegram_chat_id: p.telegram_chat_id as string | null,
        timezone: p.timezone as string | null,
      });
    }

    for (const [userProfileId, events] of byUser) {
      const profile = profileById.get(userProfileId);
      if (!profile) {
        continue;
      }

      const integrations = await loadUserIntegrations(userProfileId);
      const hevyKey = integrations.hevyApiKey;
      if (!hevyKey) {
        continue;
      }

      const workouts = await fetchRecentHevyWorkouts(hevyKey);
      const chatId = profile.telegram_chat_id?.trim();
      if (!chatId) {
        continue;
      }

      for (const event of events) {
        const dedupeKey = `gym_hevy_reconcile:${event.id}`;
        const claimed = await claimProactiveDelivery(dedupeKey, 172800);
        if (!claimed) {
          continue;
        }

        const outcome = await reconcileGymEventWithHevy(event, workouts, now, { client: supabase });
        if (outcome.kind === "skipped") {
          continue;
        }

        try {
          await sendProactiveTelegram({
            chatId,
            telegramUserIdForLog: chatId,
            userProfileId,
            plainText: outcome.message,
            kind: "gym_hevy_reconcile",
            trigger: "scheduled",
            intent: "gym_hevy_reconcile",
          });
        } catch (err) {
          logger.error({ err: String(err), eventId: event.id }, "gym hevy reconcile: send failed");
        }
      }
    }
  },
};
