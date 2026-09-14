/**
 * Reset a user's list architecture to the new Supabase-first model and re-sync Notion registry.
 *
 * Usage:
 *   TELEGRAM_USER_ID=7174221900 npx tsx scripts/reset-user-notion-lists.mts
 *
 * Optional env:
 *   NOTION_REGISTRY_JSON='{"hubPageId":"...","lists":{...}}' — overrides built-in owner reference
 *   DISCOVER_NOTION=true — run database discovery after reset (requires notion_token)
 */
import "dotenv/config";

import { supabase } from "../src/tools/clients.js";
import {
  discoverNotionLists,
  resetUserListArchitecture,
  syncRegistryFromLists,
} from "../src/integrations/notion/notionSetup.js";
import { OWNER_NOTION_REGISTRY_REFERENCE } from "../src/tools/notionRegistry.js";
import { upsertUserIntegrations, loadUserIntegrations } from "../src/users/userIntegrations.js";

const TELEGRAM_USER_ID = process.env.TELEGRAM_USER_ID?.trim();
if (!TELEGRAM_USER_ID) {
  console.error("Set TELEGRAM_USER_ID.");
  process.exit(1);
}

const { data: profile, error: profileErr } = await supabase
  .from("user_profile")
  .select("id, display_name, telegram_chat_id")
  .eq("telegram_chat_id", TELEGRAM_USER_ID)
  .maybeSingle();

if (profileErr || !profile) {
  console.error("Profile not found:", profileErr?.message ?? "no row");
  process.exit(1);
}

const userProfileId = profile.id as string;
console.log("Resetting list architecture for:", profile);

const registryJson = process.env.NOTION_REGISTRY_JSON?.trim();
const registry = registryJson
  ? (JSON.parse(registryJson) as Record<string, unknown>)
  : (OWNER_NOTION_REGISTRY_REFERENCE as Record<string, unknown>);

const integrations = await loadUserIntegrations(userProfileId);
const hubFromRegistry =
  typeof registry.hubPageId === "string" ? registry.hubPageId : undefined;

const upsert = await upsertUserIntegrations({
  userProfileId,
  notionRegistry: registry,
  ...(hubFromRegistry
    ? {
        notionDailyLogParentPageId: hubFromRegistry,
        notionMorningBriefParentPageId: hubFromRegistry,
      }
    : {}),
  ...(integrations.notionToken ? {} : {}),
});

if (!upsert.ok) {
  console.error("Failed to upsert notion_registry:", upsert.error);
  process.exit(1);
}

const resetMsg = await resetUserListArchitecture(userProfileId);
console.log(resetMsg);

await syncRegistryFromLists(userProfileId);
console.log("Synced notion_registry from list rows.");

if (process.env.DISCOVER_NOTION?.trim().toLowerCase() === "true") {
  const discover = await discoverNotionLists(userProfileId);
  console.log("\nDiscover result:\n", discover);
}

console.log("\nDone. Run list_catalog in Telegram to verify.");
