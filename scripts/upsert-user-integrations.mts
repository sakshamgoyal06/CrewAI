/**
 * Upsert per-user integration credentials from env — does NOT wipe chat history or events.
 * Only fields present in the environment are written (undefined keys are left alone).
 *
 * Usage (fill per-user vars in .env, then):
 *   TELEGRAM_USER_ID=7174221900 npx tsx scripts/upsert-user-integrations.mts
 */
import "dotenv/config";

import { supabase } from "../src/tools/clients.js";
import { upsertUserIntegrations, type UserIntegrations } from "../src/users/userIntegrations.js";

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

function fromEnv(...names: string[]): string | undefined {
  for (const name of names) {
    const v = process.env[name]?.trim();
    if (v) {
      return v;
    }
  }
  return undefined;
}

const patch: UserIntegrations = {};
const calendar = fromEnv("GOOGLE_CALENDAR_REFRESH_TOKEN");
const youtube = fromEnv("GOOGLE_YOUTUBE_REFRESH_TOKEN");
const hevy = fromEnv("HEVY_API_KEY", "MAGNUS_HEVY_API_KEY");
const notion = fromEnv("NOTION_TOKEN", "NOTION_API_KEY", "NOTION_INTEGRATION_TOKEN");
const notionDaily = fromEnv("NOTION_DAILY_LOG_PARENT_PAGE_ID");
const notionBrief = fromEnv("NOTION_MORNING_BRIEF_PARENT_PAGE_ID");
const notionGoals = fromEnv("NOTION_GOALS_DATABASE_ID");
const notionCheckins = fromEnv("NOTION_DAILY_CHECKINS_DATABASE_ID");

if (calendar !== undefined) patch.googleCalendarRefreshToken = calendar;
if (youtube !== undefined) patch.youtubeRefreshToken = youtube;
if (hevy !== undefined) patch.hevyApiKey = hevy;
if (notion !== undefined) patch.notionToken = notion;
if (notionDaily !== undefined) patch.notionDailyLogParentPageId = notionDaily;
if (notionBrief !== undefined) patch.notionMorningBriefParentPageId = notionBrief;
if (notionGoals !== undefined) patch.notionGoalsDatabaseId = notionGoals;
if (notionCheckins !== undefined) patch.notionDailyCheckinsDatabaseId = notionCheckins;

if (Object.keys(patch).length === 0) {
  console.error(
    "No integration env vars set. Example: GOOGLE_YOUTUBE_REFRESH_TOKEN=... TELEGRAM_USER_ID=... npx tsx scripts/upsert-user-integrations.mts",
  );
  process.exit(1);
}

const result = await upsertUserIntegrations({
  userProfileId: profile.id,
  ...patch,
});

if (!result.ok) {
  console.error("Failed to upsert integrations:", result.error);
  process.exit(1);
}

console.log("Updated user_integrations for:", profile);
console.log("Wrote keys:");
for (const key of Object.keys(patch)) {
  console.log(`  ${key}: yes`);
}
