/**
 * One-time setup for the health app. Non-destructive: finds (or creates) your user_profile,
 * makes sure a user_health_profile row exists, and prints the two env vars the app needs.
 *
 * Usage:
 *   npm run app:setup
 *
 * Optional env:
 *   OWNER_PROFILE_ID=<uuid>        use this user_profile instead of auto-detecting
 *   OWNER_DISPLAY_NAME=Saksham     only used when a new profile is created
 *   OWNER_TIMEZONE=Asia/Kolkata    sets user_profile.timezone (days are scored in this zone)
 */
import "dotenv/config";
import { randomBytes } from "node:crypto";

import { supabase } from "../src/tools/clients.js";

const explicitId = process.env.OWNER_PROFILE_ID?.trim();
const timezone = process.env.OWNER_TIMEZONE?.trim();

async function findOrCreateProfile(): Promise<string> {
  if (explicitId) {
    return explicitId;
  }
  const { data, error } = await supabase
    .from("user_profile")
    .select("id, display_name, allowlisted, created_at")
    .order("created_at", { ascending: true });
  if (error) {
    throw new Error(`read user_profile: ${error.message}`);
  }
  const owners = (data ?? []).filter((r) => r.allowlisted);
  const pick = owners.length === 1 ? owners[0] : data?.length === 1 ? data[0] : null;
  if (pick) {
    console.log(`Using existing profile ${pick.id} (${pick.display_name ?? "no name"}).`);
    return String(pick.id);
  }
  if ((data ?? []).length > 1) {
    console.error("Several profiles exist; set OWNER_PROFILE_ID to the one to use:");
    for (const r of data ?? []) console.error(`  ${r.id}  ${r.display_name ?? ""}`);
    process.exit(1);
  }
  const created = await supabase
    .from("user_profile")
    .insert({
      display_name: process.env.OWNER_DISPLAY_NAME?.trim() || null,
      timezone: timezone || "UTC",
      allowlisted: true,
    })
    .select("id")
    .single();
  if (created.error || !created.data) {
    throw new Error(`create user_profile: ${created.error?.message}`);
  }
  console.log(`Created profile ${created.data.id}.`);
  return String(created.data.id);
}

const profileId = await findOrCreateProfile();

if (timezone) {
  const { error } = await supabase.from("user_profile").update({ timezone }).eq("id", profileId);
  if (error) console.warn(`set timezone: ${error.message}`);
}

const { error: hpError } = await supabase
  .from("user_health_profile")
  .upsert({ user_profile_id: profileId }, { onConflict: "user_profile_id", ignoreDuplicates: true });
if (hpError) console.warn(`user_health_profile: ${hpError.message}`);

console.log("\nAdd these to Railway (or .env). The token is new each run; keep the one you deploy.\n");
console.log(`MAGNUS_HEALTH_APP_USER_PROFILE_ID=${profileId}`);
console.log(`MAGNUS_HEALTH_APP_TOKEN=${randomBytes(32).toString("hex")}`);
