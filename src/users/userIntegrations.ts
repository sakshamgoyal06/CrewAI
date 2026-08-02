/**
 * Per-user integration credentials. Platform env holds shared OAuth app ids only
 * (e.g. GOOGLE_CLIENT_ID); tokens and API keys live here.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { supabase as defaultClient } from "../tools/clients.js";

export type UserIntegrations = {
  googleCalendarRefreshToken?: string;
  hevyApiKey?: string;
  notionToken?: string;
  notionDailyLogParentPageId?: string;
  notionMorningBriefParentPageId?: string;
  notionGoalsDatabaseId?: string;
  notionDailyCheckinsDatabaseId?: string;
};

const INTEGRATION_COLUMNS =
  "google_calendar_refresh_token, hevy_api_key, notion_token, notion_daily_log_parent_page_id, notion_morning_brief_parent_page_id, notion_goals_database_id, notion_daily_checkins_database_id";

function trimOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function rowToIntegrations(data: Record<string, unknown>): UserIntegrations {
  return {
    googleCalendarRefreshToken: trimOrUndefined(data.google_calendar_refresh_token),
    hevyApiKey: trimOrUndefined(data.hevy_api_key),
    notionToken: trimOrUndefined(data.notion_token),
    notionDailyLogParentPageId: trimOrUndefined(data.notion_daily_log_parent_page_id),
    notionMorningBriefParentPageId: trimOrUndefined(data.notion_morning_brief_parent_page_id),
    notionGoalsDatabaseId: trimOrUndefined(data.notion_goals_database_id),
    notionDailyCheckinsDatabaseId: trimOrUndefined(data.notion_daily_checkins_database_id),
  };
}

export async function loadUserIntegrations(
  userProfileId: string | undefined,
  client: SupabaseClient = defaultClient,
): Promise<UserIntegrations> {
  if (!userProfileId?.trim()) {
    return {};
  }

  const { data, error } = await client
    .from("user_integrations")
    .select(INTEGRATION_COLUMNS)
    .eq("user_profile_id", userProfileId)
    .maybeSingle();

  if (error || !data) {
    return {};
  }

  return rowToIntegrations(data as Record<string, unknown>);
}

export async function upsertUserIntegrations(
  input: { userProfileId: string } & UserIntegrations,
  client: SupabaseClient = defaultClient,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await client.from("user_integrations").upsert(
    {
      user_profile_id: input.userProfileId,
      google_calendar_refresh_token: input.googleCalendarRefreshToken ?? null,
      hevy_api_key: input.hevyApiKey ?? null,
      notion_token: input.notionToken ?? null,
      notion_daily_log_parent_page_id: input.notionDailyLogParentPageId ?? null,
      notion_morning_brief_parent_page_id: input.notionMorningBriefParentPageId ?? null,
      notion_goals_database_id: input.notionGoalsDatabaseId ?? null,
      notion_daily_checkins_database_id: input.notionDailyCheckinsDatabaseId ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_profile_id" },
  );

  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
