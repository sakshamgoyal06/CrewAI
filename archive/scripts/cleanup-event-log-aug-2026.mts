/**
 * Fix corrupted event-log rows (Aug 2026) and backfill Hevy timestamps where possible.
 *
 * Run: npx tsx scripts/cleanup-event-log-aug-2026.mts
 */
import "dotenv/config";

import {
  fetchRecentHevyWorkouts,
  reconcileGymEventWithHevy,
  type GymEventCandidate,
} from "../src/events/gymHevyReconcile.js";
import { pickHevyWorkoutForGymEvent, hevyWorkoutTimes } from "../src/events/gymHevyMatch.js";
import { supabase } from "../src/tools/clients.js";
import { loadUserIntegrations } from "../src/users/userIntegrations.js";

const USER_PROFILE_ID = process.env.MAGNUS_MORNING_BRIEF_DEFAULT_USER_PROFILE_ID?.trim();

if (!USER_PROFILE_ID) {
  console.error("Set MAGNUS_MORNING_BRIEF_DEFAULT_USER_PROFILE_ID in .env");
  process.exit(1);
}

const AI_SESSION_ID = "b10802e5-603e-477a-9051-16bc9b18ead3";
const THU_PULL_A_ID = "43045d69-9a1e-4fb2-a4c6-0c76286a1ace";

async function fixAiSession(): Promise<void> {
  const { data, error } = await supabase
    .from("magnus_events")
    .select("planned_start_at, planned_end_at")
    .eq("id", AI_SESSION_ID)
    .maybeSingle();

  if (error || !data?.planned_start_at) {
    console.error("AI session read failed:", error);
    return;
  }

  const started = data.planned_start_at as string;
  const ended = (data.planned_end_at as string | null) ?? started;

  const { error: updErr } = await supabase
    .from("magnus_events")
    .update({
      status: "done",
      started_at: started,
      ended_at: ended,
      reason: "Spent the evening teaching wife SQL — enjoyed it.",
    })
    .eq("id", AI_SESSION_ID);

  if (updErr) {
    console.error("AI session fix failed:", updErr.message);
    return;
  }
  console.log("AI session fixed:", AI_SESSION_ID);
}

async function fixThuPullA(hevyKey: string | undefined): Promise<void> {
  const { data, error } = await supabase
    .from("magnus_events")
    .select(
      "id, user_profile_id, title, time_zone, planned_start_at, status, metadata, external_refs",
    )
    .eq("id", THU_PULL_A_ID)
    .maybeSingle();

  if (error || !data) {
    console.error("Thu Pull A read failed:", error);
    return;
  }

  let startedAt: string | null = null;
  let endedAt: string | null = null;
  let hevyWorkoutId: string | null = null;

  if (hevyKey) {
    const workouts = await fetchRecentHevyWorkouts(hevyKey);
    const plannedStart = new Date(data.planned_start_at as string);
    const match = pickHevyWorkoutForGymEvent(workouts, {
      eventTitle: data.title as string,
      plannedStartAt: plannedStart,
      timeZone: (data.time_zone as string) || "Asia/Kolkata",
    });
    if (match?.id) {
      const times = hevyWorkoutTimes(match);
      if (times) {
        startedAt = times.startedAt.toISOString();
        endedAt = times.endedAt.toISOString();
        hevyWorkoutId = match.id;
        console.log("Hevy match for Thu Pull A:", match.title, startedAt, "→", endedAt);
      }
    }
  }

  const patch: Record<string, unknown> = {
    status: "done",
    outcome_note: "Completed Pull A — Thursday session (Hevy-synced).",
    metadata: {
      ...((data.metadata as Record<string, unknown>) ?? {}),
      hevy_reconcile: {
        at: new Date().toISOString(),
        result: "matched",
        hevy_workout_id: hevyWorkoutId ?? undefined,
      },
    },
  };

  if (startedAt && endedAt) {
    patch.started_at = startedAt;
    patch.ended_at = endedAt;
  }

  if (hevyWorkoutId) {
    patch.external_refs = {
      ...((data.external_refs as Record<string, unknown>) ?? {}),
      hevy_workout_id: hevyWorkoutId,
    };
  }

  const { error: updErr } = await supabase.from("magnus_events").update(patch).eq("id", THU_PULL_A_ID);

  if (updErr) {
    console.error("Thu Pull A fix failed:", updErr.message);
    return;
  }
  console.log("Thu Pull A fixed:", THU_PULL_A_ID);
}

async function reconcileRecentMissedGyms(hevyKey: string | undefined): Promise<void> {
  if (!hevyKey) {
    return;
  }

  const { data, error } = await supabase
    .from("magnus_events")
    .select(
      "id, user_profile_id, title, time_zone, planned_start_at, status, metadata, external_refs",
    )
    .eq("user_profile_id", USER_PROFILE_ID)
    .eq("status", "missed")
    .ilike("title", "%gym%")
    .gte("planned_start_at", "2026-08-01")
    .order("planned_start_at", { ascending: true });

  if (error || !data?.length) {
    return;
  }

  const workouts = await fetchRecentHevyWorkouts(hevyKey);
  const now = new Date();

  for (const row of data as GymEventCandidate[]) {
    const outcome = await reconcileGymEventWithHevy(row, workouts, now, { client: supabase });
    console.log(row.title, row.planned_start_at, "→", outcome.kind, outcome.kind === "skipped" ? outcome.reason : "");
  }
}

const integrations = await loadUserIntegrations(USER_PROFILE_ID);
const hevyKey = integrations.hevyApiKey;

console.log("Cleaning event log for", USER_PROFILE_ID);
await fixAiSession();
await fixThuPullA(hevyKey);
await reconcileRecentMissedGyms(hevyKey);

const { data: summary } = await supabase
  .from("magnus_events")
  .select("title, status, planned_start_at, started_at, ended_at, actual_minutes")
  .eq("user_profile_id", USER_PROFILE_ID)
  .gte("planned_start_at", "2026-08-04")
  .order("planned_start_at");

console.log("\nRecent events:\n", JSON.stringify(summary, null, 2));
