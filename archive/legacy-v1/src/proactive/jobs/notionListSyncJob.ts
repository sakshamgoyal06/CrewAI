import { logger } from "../../logger.js";
import { syncSupabaseToNotion } from "../../integrations/notion/notionListSync.js";
import { redis, supabase } from "../../tools/clients.js";
import {
  notionListSyncIntervalMinutes,
  notionListSyncJobEnabled,
  notionListSyncMaxUsersPerTick,
} from "../env.js";
import type { ScheduledProactiveJob } from "./types.js";

const SYNC_MARKER_PREFIX = "magnus:notion:list_sync:";

async function listNotionConnectedUserIds(): Promise<string[]> {
  const { data, error } = await supabase
    .from("user_integrations")
    .select("user_profile_id, notion_token")
    .not("notion_token", "is", null);

  if (error) {
    logger.warn({ err: error.message }, "notion list sync: user query failed");
    return [];
  }

  const ids: string[] = [];
  for (const row of data ?? []) {
    const token = row.notion_token as string | null;
    const id = row.user_profile_id as string | null;
    if (token?.trim() && id?.trim()) {
      ids.push(id.trim());
    }
  }
  return ids;
}

/**
 * Daily Supabase ↔ Notion reconciliation for connected users.
 * Supabase is canonical — conflicts push Supabase → Notion. Chat `sync notion` runs immediately.
 */
export const notionListSyncScheduledJob: ScheduledProactiveJob = {
  id: "notion_list_sync",
  enabled: notionListSyncJobEnabled,
  async run() {
    const intervalMin = notionListSyncIntervalMinutes();
    if (intervalMin <= 0) {
      return;
    }

    const ttlSec = intervalMin * 60;
    const maxUsers = notionListSyncMaxUsersPerTick();
    const userIds = await listNotionConnectedUserIds();
    if (userIds.length === 0) {
      return;
    }

    let synced = 0;
    for (const userProfileId of userIds) {
      if (synced >= maxUsers) {
        break;
      }

      const key = `${SYNC_MARKER_PREFIX}${userProfileId}`;
      const claimed = await redis.set(key, "1", { nx: true, ex: ttlSec });
      if (!claimed) {
        continue;
      }

      try {
        await syncSupabaseToNotion(userProfileId);
        synced++;
      } catch (err) {
        logger.warn(
          { err: String(err), userProfileId },
          "notion list sync failed for user",
        );
      }
    }

    if (synced > 0) {
      logger.info({ synced, intervalMin }, "notion list sync tick completed");
    }
  },
};
