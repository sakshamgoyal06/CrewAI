/**
 * One-off: verify Supabase (service role) connectivity and chat table.
 * Run: npm run test:supabase  (or npx tsx scripts/test-supabase.mts)
 */
import "dotenv/config";
import "../src/tools/clients.js";
import { supabase } from "../src/tools/clients.js";
import { resolveTelegramUserProfile } from "../src/tools/chatLog.js";

const SCRIPT_TELEGRAM_USER = "script-test-user";

let profileId: string;
try {
  const u = await resolveTelegramUserProfile(SCRIPT_TELEGRAM_USER);
  profileId = u.profileId;
} catch (e) {
  console.error("resolveTelegramUserProfile failed:", e);
  process.exit(1);
}

const { data: inserted, error: iErr } = await supabase
  .from("magnus_chat_messages")
  .insert({
    user_profile_id: profileId,
    telegram_user_id: SCRIPT_TELEGRAM_USER,
    role: "user",
    content: "[connectivity test] ping from Magnus script",
    source: "script",
  })
  .select("id, created_at")
  .single();

if (iErr) {
  console.error("magnus_chat_messages insert failed:", iErr);
  process.exit(1);
}

const { error: dErr } = await supabase
  .from("magnus_chat_messages")
  .delete()
  .eq("id", inserted.id);

if (dErr) {
  console.error("cleanup delete failed:", dErr);
  process.exit(1);
}

const { error: memTableErr } = await supabase
  .from("memory_summaries")
  .select("id")
  .limit(1);

if (memTableErr) {
  console.error(
    "memory_summaries missing or unreadable (apply supabase/migrations/20260729100000_memory_summaries.sql):",
    memTableErr,
  );
  process.exit(1);
}

console.log(
  "Supabase OK: user_profile readable, magnus_chat_messages insert/delete OK, memory_summaries reachable.",
);
console.log("Test row id (deleted):", inserted.id);
