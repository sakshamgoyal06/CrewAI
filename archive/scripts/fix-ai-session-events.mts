/**
 * One-off: fix duplicate AI session rows from the 2026-08-02 Telegram test.
 * Run (with real Supabase creds in .env): npx tsx scripts/fix-ai-session-events.mts
 */
import "dotenv/config";
import { supabase } from "../src/tools/clients.js";

const AUG2_ID = "49299412-bb4e-4355-b658-fcc2e9b92f18";
const AUG3_ID = "f44df4a7-005a-4362-bdb6-1507326ee71a";

const { data: before, error: readErr } = await supabase
  .from("magnus_events")
  .select("id, title, pillar, status, reason, planned_start_at, google_event_id")
  .in("id", [AUG2_ID, AUG3_ID]);

if (readErr) {
  console.error("read failed:", readErr);
  process.exit(1);
}
console.log("Before:", JSON.stringify(before, null, 2));

const { error: cancelErr } = await supabase
  .from("magnus_events")
  .update({ status: "cancelled", reason: "wrong day — user wanted tomorrow only" })
  .eq("id", AUG2_ID);

const { error: pillarErr } = await supabase
  .from("magnus_events")
  .update({ pillar: "wisdom" })
  .eq("id", AUG3_ID);

if (cancelErr || pillarErr) {
  console.error("update failed:", cancelErr, pillarErr);
  process.exit(1);
}

const { data: after } = await supabase
  .from("magnus_events")
  .select("id, title, pillar, status, reason, planned_start_at, google_event_id")
  .in("id", [AUG2_ID, AUG3_ID]);

console.log("After:", JSON.stringify(after, null, 2));
