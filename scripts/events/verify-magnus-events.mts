/**
 * End-to-end check of `magnus_events` against the live Supabase project.
 *
 * Plans an event, moves it, finishes it, reads the stats back, and deletes everything it made.
 * Run after applying supabase/migrations/20260801120000_magnus_events.sql:
 *
 *   npm run test:events
 *
 * Needs real SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY — the CI dummies will not do.
 */
import "dotenv/config";
import { supabase } from "../../src/tools/clients.js";
import { resolveTelegramUserProfile } from "../../src/tools/chatLog.js";
import {
  getMagnusEventChain,
  listActivityStats,
  listMagnusEvents,
  markMissedMagnusEvents,
  recordMagnusEvent,
  rescheduleMagnusEvent,
  updateMagnusEventStatus,
} from "../../src/events/eventsStore.js";

const SCRIPT_TELEGRAM_USER = "script-test-user";
const TZ = "Asia/Kolkata";
const TITLE = `Schema check ${Date.now()}`;

function fail(step: string, detail: unknown): never {
  console.error(`✗ ${step}:`, detail);
  process.exit(1);
}

function check(condition: boolean, label: string, detail?: unknown): void {
  if (!condition) {
    fail(label, detail ?? "assertion failed");
  }
  console.log(`✓ ${label}`);
}

let profileId: string;
try {
  profileId = (await resolveTelegramUserProfile(SCRIPT_TELEGRAM_USER)).profileId;
} catch (e) {
  fail("resolve test profile", e);
}

const inAnHour = new Date(Date.now() + 60 * 60 * 1000);
const inTwoHours = new Date(Date.now() + 2 * 60 * 60 * 1000);
const inThreeHours = new Date(Date.now() + 3 * 60 * 60 * 1000);

const planned = await recordMagnusEvent({
  userProfileId: profileId,
  title: TITLE,
  details: "Written by scripts/events/verify-magnus-events.mts",
  pillar: "wisdom",
  timeZone: TZ,
  plannedStartAt: inAnHour,
  plannedEndAt: inTwoHours,
  reminderAt: new Date(inAnHour.getTime() - 15 * 60 * 1000),
  source: "system",
});
if (!planned.ok) {
  fail("insert a planned event", planned.error);
}
const first = planned.event;
check(first.status === "planned", "insert returns a planned row");
check(first.activity_key !== null, "activity_key is derived", first.activity_key);
check(first.planned_local_date !== null, "local date is derived", first.planned_local_date);
check(first.planned_duration_minutes === 60, "duration is derived", first.planned_duration_minutes);
check(first.root_event_id === first.id, "a first plan roots its own chain");
check(first.is_latest, "a first plan is the live row");

const moved = await rescheduleMagnusEvent({
  userProfileId: profileId,
  eventId: first.id,
  newStartAt: inThreeHours,
  reason: "verification run",
});
if (!moved.ok) {
  fail("reschedule", moved.error);
}
check(moved.event.reschedule_count === 1, "the move is counted");
check(moved.event.rescheduled_from_event_id === first.id, "the replacement points back");
check(moved.event.root_event_id === first.id, "the chain keeps its root");
check(
  moved.event.planned_duration_minutes === 60,
  "the length carries over",
  moved.event.planned_duration_minutes,
);
check(moved.event.reminder_at !== null, "the reminder moves with it");

const chain = await getMagnusEventChain(profileId, first.id);
check(chain.length === 2, "the chain reads back in one query", chain.length);
check(chain[0]?.status === "postponed", "the original is closed as postponed", chain[0]?.status);
check(!chain[0]?.is_latest, "the original is no longer live");

const finished = await updateMagnusEventStatus({
  userProfileId: profileId,
  eventId: moved.event.id,
  status: "done",
  outcomeNote: "verification run",
  qualityRating: 5,
  startedAt: new Date(inThreeHours.getTime() + 10 * 60 * 1000),
  endedAt: new Date(inThreeHours.getTime() + 55 * 60 * 1000),
});
if (!finished.ok) {
  fail("mark done", finished.error);
}
check(finished.event.completed_at !== null, "completion is stamped");
check(finished.event.actual_duration_minutes === 45, "real duration is computed", finished.event.actual_duration_minutes);
check(finished.event.start_delay_minutes === 10, "lateness is computed", finished.event.start_delay_minutes);
check(finished.event.status_history.length >= 2, "the status trail is kept", finished.event.status_history);

const listed = await listMagnusEvents({
  userProfileId: profileId,
  query: TITLE,
  limit: 10,
});
check(listed.ok && listed.events.length === 2, "both rows are readable");

const stats = await listActivityStats({
  userProfileId: profileId,
  activityKey: first.activity_key ?? undefined,
});
check(stats.length === 1, "the activity view aggregates the chain", stats.length);
check(stats[0]?.times_done === 1, "the completion is counted", stats[0]?.times_done);
check(stats[0]?.times_postponed === 1, "the slip is counted", stats[0]?.times_postponed);

const swept = await markMissedMagnusEvents(profileId, 2);
check(typeof swept === "number", "the missed sweep runs", swept);

const { error: cleanupErr } = await supabase
  .from("magnus_events")
  .delete()
  .eq("user_profile_id", profileId)
  .eq("root_event_id", first.id);
if (cleanupErr) {
  fail("cleanup", cleanupErr);
}
console.log(`✓ cleaned up ${chain.length} rows`);
console.log("\nmagnus_events is live and behaving.");
