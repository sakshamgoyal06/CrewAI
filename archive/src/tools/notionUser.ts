/**
 * Per-user Notion config resolved from `user_integrations`.
 */
import type { Client } from "@notionhq/client";

import { loadUserIntegrations } from "../users/userIntegrations.js";
import { createNotionClient } from "./notion.js";

export type NotionUserConfig = {
  token: string;
  dailyLogParentPageId?: string;
  morningBriefParentPageId?: string;
  goalsDatabaseId?: string;
  dailyCheckinsDatabaseId?: string;
};

export async function loadNotionUserConfig(
  userProfileId: string,
): Promise<NotionUserConfig | null> {
  const integrations = await loadUserIntegrations(userProfileId);
  if (!integrations.notionToken) {
    return null;
  }
  return {
    token: integrations.notionToken,
    dailyLogParentPageId: integrations.notionDailyLogParentPageId,
    morningBriefParentPageId: integrations.notionMorningBriefParentPageId,
    goalsDatabaseId: integrations.notionGoalsDatabaseId,
    dailyCheckinsDatabaseId: integrations.notionDailyCheckinsDatabaseId,
  };
}

export async function createNotionClientForUser(
  userProfileId: string,
): Promise<{ client: Client; config: NotionUserConfig } | null> {
  const config = await loadNotionUserConfig(userProfileId);
  if (!config) {
    return null;
  }
  const client = createNotionClient(config.token);
  if (!client) {
    return null;
  }
  return { client, config };
}
