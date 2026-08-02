/**
 * Provision a clean Magnus owner user: wipe prior Telegram-linked data, create a fresh
 * user_profile, seed program memory and integrations from env + archived seed files.
 *
 * Usage:
 *   TELEGRAM_USER_ID=<your telegram numeric id> npx tsx scripts/provision-owner-user.mts
 *
 * Optional env:
 *   OWNER_DISPLAY_NAME=Saksham
 *   OWNER_TIMEZONE=Asia/Kolkata
 *   OWNER_NORTH_STAR="Build my company, be fit, grow wealth, live intentionally"
 */
import "dotenv/config";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { supabase } from "../src/tools/clients.js";
import { upsertUserIntegrations } from "../src/users/userIntegrations.js";
import {
  PROGRAM_MEMORY_SECTIONS,
  upsertUserProgramMemory,
  type ProgramMemorySection,
} from "../src/users/userProgramMemory.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEED_DIR = join(__dirname, "seed-data/owner-health-program");

const TELEGRAM_USER_ID = process.env.TELEGRAM_USER_ID?.trim();
if (!TELEGRAM_USER_ID) {
  console.error("Set TELEGRAM_USER_ID to your Telegram numeric user id.");
  process.exit(1);
}

const OWNER = {
  displayName: process.env.OWNER_DISPLAY_NAME?.trim() || "Saksham",
  timezone: process.env.OWNER_TIMEZONE?.trim() || "Asia/Kolkata",
  northStar:
    process.env.OWNER_NORTH_STAR?.trim() ||
    "Build my company, be fit, grow wealth, live intentionally",
};

const TABLES_BY_USER = [
  "magnus_chat_messages",
  "magnus_daily_logs",
  "magnus_events",
  "meal_logs",
  "memory_summaries",
  "user_health_profile",
  "user_program_memory",
  "user_integrations",
] as const;

async function deleteUserData(profileId: string): Promise<void> {
  for (const table of TABLES_BY_USER) {
    const { error } = await supabase.from(table).delete().eq("user_profile_id", profileId);
    if (error) {
      console.warn(`delete ${table}:`, error.message);
    }
  }
}

function loadSeedSection(section: ProgramMemorySection): string | null {
  const fileMap: Record<ProgramMemorySection, string> = {
    user_context: "user-context.md",
    weekly_schedule: "weekly-schedule.md",
    program_learnings: "program-learnings.md",
    recovery_routine: "recovery-routine.md",
  };
  const path = join(SEED_DIR, fileMap[section]);
  if (!existsSync(path)) {
    return null;
  }
  return readFileSync(path, "utf8").trim();
}

const { data: existingProfiles } = await supabase
  .from("user_profile")
  .select("id")
  .eq("telegram_chat_id", TELEGRAM_USER_ID);

for (const row of existingProfiles ?? []) {
  console.log(`Wiping data for old profile ${row.id}…`);
  await deleteUserData(row.id);
}

if (existingProfiles && existingProfiles.length > 0) {
  const { error: delProfiles } = await supabase
    .from("user_profile")
    .delete()
    .eq("telegram_chat_id", TELEGRAM_USER_ID);
  if (delProfiles) {
    console.error("Failed to delete old profiles:", delProfiles);
    process.exit(1);
  }
}

const { data: created, error: createErr } = await supabase
  .from("user_profile")
  .insert({
    telegram_chat_id: TELEGRAM_USER_ID,
    display_name: OWNER.displayName,
    timezone: OWNER.timezone,
    north_star_goal: OWNER.northStar,
    allowlisted: true,
    user_tier: "internal",
    access_flags: {
      chat: true,
      agents: true,
      deep_memory: true,
    },
  })
  .select("id, display_name, timezone, north_star_goal, telegram_chat_id")
  .single();

if (createErr || !created) {
  console.error("Failed to create profile:", createErr);
  process.exit(1);
}

const profileId = created.id as string;
console.log("Created profile:", created);

for (const section of PROGRAM_MEMORY_SECTIONS) {
  const body = loadSeedSection(section);
  if (!body) {
    console.warn(`No seed file for ${section}, skipping.`);
    continue;
  }
  const saved = await upsertUserProgramMemory({ userProfileId: profileId, section, body });
  if (!saved.ok) {
    console.error(`Failed to seed ${section}:`, saved.error);
    process.exit(1);
  }
  console.log(`Seeded program memory: ${section} (${body.length} chars)`);
}

const integrations = await upsertUserIntegrations({
  userProfileId: profileId,
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
});

if (!integrations.ok) {
  console.error("Failed to seed integrations:", integrations.error);
  process.exit(1);
}

console.log("\nDone. Fresh owner user ready:");
console.log(`  user_profile.id: ${profileId}`);
console.log(`  telegram_chat_id: ${TELEGRAM_USER_ID}`);
console.log(`  display_name: ${OWNER.displayName}`);
console.log("\nApply migration first if tables are missing:");
console.log("  supabase/migrations/20260802120000_user_personalization.sql");
