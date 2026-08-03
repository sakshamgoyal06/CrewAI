/**
 * Per-user integration credentials. Platform env holds shared OAuth app ids only
 * (e.g. GOOGLE_CLIENT_ID); tokens and API keys live here.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { supabase as defaultClient } from "../tools/clients.js";

export type UserIntegrations = {
  googleCalendarRefreshToken?: string;
  googleYoutubeRefreshToken?: string;
  hevyApiKey?: string;
  notionToken?: string;
  notionDailyLogParentPageId?: string;
  notionMorningBriefParentPageId?: string;
  notionGoalsDatabaseId?: string;
  notionDailyCheckinsDatabaseId?: string;
  notionRegistry?: Record<string, unknown>;
};

const INTEGRATION_COLUMNS =
  "google_calendar_refresh_token, google_youtube_refresh_token, hevy_api_key, notion_token, notion_daily_log_parent_page_id, notion_morning_brief_parent_page_id, notion_goals_database_id, notion_daily_checkins_database_id, notion_registry";

function trimOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function rowToIntegrations(data: Record<string, unknown>): UserIntegrations {
  return {
    googleCalendarRefreshToken: trimOrUndefined(data.google_calendar_refresh_token),
    googleYoutubeRefreshToken: trimOrUndefined(data.google_youtube_refresh_token),
    hevyApiKey: trimOrUndefined(data.hevy_api_key),
    notionToken: trimOrUndefined(data.notion_token),
    notionDailyLogParentPageId: trimOrUndefined(data.notion_daily_log_parent_page_id),
    notionMorningBriefParentPageId: trimOrUndefined(data.notion_morning_brief_parent_page_id),
    notionGoalsDatabaseId: trimOrUndefined(data.notion_goals_database_id),
    notionDailyCheckinsDatabaseId: trimOrUndefined(data.notion_daily_checkins_database_id),
    notionRegistry:
      data.notion_registry && typeof data.notion_registry === "object"
        ? (data.notion_registry as Record<string, unknown>)
        : undefined,
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

/**
 * Partial upsert: only columns present on `input` are written.
 * Omitting a field leaves the existing DB value alone (important for connect_youtube).
 */
export async function upsertUserIntegrations(
  input: { userProfileId: string } & UserIntegrations,
  client: SupabaseClient = defaultClient,
): Promise<{ ok: boolean; error?: string }> {
  const row: Record<string, unknown> = {
    user_profile_id: input.userProfileId,
    updated_at: new Date().toISOString(),
  };
  if (input.googleCalendarRefreshToken !== undefined) {
    row.google_calendar_refresh_token = input.googleCalendarRefreshToken || null;
  }
  if (input.googleYoutubeRefreshToken !== undefined) {
    row.google_youtube_refresh_token = input.googleYoutubeRefreshToken || null;
  }
  if (input.hevyApiKey !== undefined) {
    row.hevy_api_key = input.hevyApiKey || null;
  }
  if (input.notionToken !== undefined) {
    row.notion_token = input.notionToken || null;
  }
  if (input.notionDailyLogParentPageId !== undefined) {
    row.notion_daily_log_parent_page_id = input.notionDailyLogParentPageId || null;
  }
  if (input.notionMorningBriefParentPageId !== undefined) {
    row.notion_morning_brief_parent_page_id = input.notionMorningBriefParentPageId || null;
  }
  if (input.notionGoalsDatabaseId !== undefined) {
    row.notion_goals_database_id = input.notionGoalsDatabaseId || null;
  }
  if (input.notionDailyCheckinsDatabaseId !== undefined) {
    row.notion_daily_checkins_database_id = input.notionDailyCheckinsDatabaseId || null;
  }
  if (input.notionRegistry !== undefined) {
    row.notion_registry = input.notionRegistry;
  }

  const { error } = await client
    .from("user_integrations")
    .upsert(row, { onConflict: "user_profile_id" });

  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
