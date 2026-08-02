/**
 * Per-user integration credentials. Process env vars are the deploy-owner fallback only.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { supabase as defaultClient } from "../tools/clients.js";

export type UserIntegrations = {
  googleCalendarRefreshToken?: string;
  hevyApiKey?: string;
  notionDailyLogParentPageId?: string;
  notionMorningBriefParentPageId?: string;
};

function envFallback(): UserIntegrations {
  return {
    googleCalendarRefreshToken: process.env.GOOGLE_CALENDAR_REFRESH_TOKEN?.trim() || undefined,
    hevyApiKey:
      process.env.HEVY_API_KEY?.trim() || process.env.MAGNUS_HEVY_API_KEY?.trim() || undefined,
  };
}

export async function loadUserIntegrations(
  userProfileId: string | undefined,
  client: SupabaseClient = defaultClient,
): Promise<UserIntegrations> {
  if (!userProfileId?.trim()) {
    return envFallback();
  }

  const { data, error } = await client
    .from("user_integrations")
    .select(
      "google_calendar_refresh_token, hevy_api_key, notion_daily_log_parent_page_id, notion_morning_brief_parent_page_id",
    )
    .eq("user_profile_id", userProfileId)
    .maybeSingle();

  if (error || !data) {
    return envFallback();
  }

  return {
    googleCalendarRefreshToken:
      (data.google_calendar_refresh_token as string | null)?.trim() ||
      envFallback().googleCalendarRefreshToken,
    hevyApiKey: (data.hevy_api_key as string | null)?.trim() || envFallback().hevyApiKey,
    notionDailyLogParentPageId:
      (data.notion_daily_log_parent_page_id as string | null)?.trim() || undefined,
    notionMorningBriefParentPageId:
      (data.notion_morning_brief_parent_page_id as string | null)?.trim() || undefined,
  };
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
      notion_daily_log_parent_page_id: input.notionDailyLogParentPageId ?? null,
      notion_morning_brief_parent_page_id: input.notionMorningBriefParentPageId ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_profile_id" },
  );

  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
