/**
 * Upsert per-user integration credentials from env — does NOT wipe chat history or events.
 *
 * Usage (fill per-user vars in .env, then):
 *   TELEGRAM_USER_ID=7174221900 npx tsx scripts/upsert-user-integrations.mts
 */
import "dotenv/config";

import { supabase } from "../src/tools/clients.js";
import { upsertUserIntegrations } from "../src/users/userIntegrations.js";

const TELEGRAM_USER_ID = process.env.TELEGRAM_USER_ID?.trim();
if (!TELEGRAM_USER_ID) {
  console.error("Set TELEGRAM_USER_ID to your Telegram numeric user id.");
  process.exit(1);
}

const { data: profile, error: profileErr } = await supabase
  .from("user_profile")
  .select("id, display_name, telegram_chat_id")
  .eq("telegram_chat_id", TELEGRAM_USER_ID)
  .maybeSingle();

if (profileErr || !profile) {
  console.error("Profile not found for TELEGRAM_USER_ID:", profileErr?.message ?? "no row");
  process.exit(1);
}

const result = await upsertUserIntegrations({
  userProfileId: profile.id,
  googleCalendarRefreshToken: process.env.GOOGLE_CALENDAR_REFRESH_TOKEN?.trim(),
  googleYoutubeRefreshToken: process.env.GOOGLE_YOUTUBE_REFRESH_TOKEN?.trim(),
  hevyApiKey:
    process.env.HEVY_API_KEY?.trim() || process.env.MAGNUS_HEVY_API_KEY?.trim(),
  notionToken:
    process.env.NOTION_TOKEN?.trim() ||
    process.env.NOTION_API_KEY?.trim() ||
    process.env.NOTION_INTEGRATION_TOKEN?.trim(),
  notionDailyLogParentPageId: process.env.NOTION_DAILY_LOG_PARENT_PAGE_ID?.trim(),
  notionMorningBriefParentPageId: process.env.NOTION_MORNING_BRIEF_PARENT_PAGE_ID?.trim(),
  notionGoalsDatabaseId: process.env.NOTION_GOALS_DATABASE_ID?.trim(),
  notionDailyCheckinsDatabaseId: process.env.NOTION_DAILY_CHECKINS_DATABASE_ID?.trim(),
  notionRegistry: process.env.NOTION_REGISTRY_JSON?.trim()
    ? (JSON.parse(process.env.NOTION_REGISTRY_JSON) as Record<string, unknown>)
    : undefined,
});

if (!result.ok) {
  console.error("Failed to upsert integrations:", result.error);
  process.exit(1);
}

console.log("Updated user_integrations for:", profile);
console.log("Stored keys present:");
console.log("  google_youtube_refresh_token:", Boolean(process.env.GOOGLE_YOUTUBE_REFRESH_TOKEN?.trim()));
console.log("  hevy_api_key:", Boolean(process.env.HEVY_API_KEY?.trim() || process.env.MAGNUS_HEVY_API_KEY?.trim()));
console.log("  notion_token:", Boolean(process.env.NOTION_TOKEN?.trim()));
console.log("  notion_daily_log_parent_page_id:", Boolean(process.env.NOTION_DAILY_LOG_PARENT_PAGE_ID?.trim()));
console.log("  notion_morning_brief_parent_page_id:", Boolean(process.env.NOTION_MORNING_BRIEF_PARENT_PAGE_ID?.trim()));
console.log("  notion_goals_database_id:", Boolean(process.env.NOTION_GOALS_DATABASE_ID?.trim()));
console.log("  notion_daily_checkins_database_id:", Boolean(process.env.NOTION_DAILY_CHECKINS_DATABASE_ID?.trim()));
