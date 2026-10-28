/**
 * Rows for the post-gym-slot workout check (`health_workout_checks`), one per training day.
 */
import { logger } from "../logger.js";
import { supabase } from "../tools/clients.js";

export const WORKOUT_CHECK_STATUSES = ["found", "missing", "skipped", "trained_unlogged"] as const;
export type WorkoutCheckStatus = (typeof WORKOUT_CHECK_STATUSES)[number];

export type WorkoutCheck = {
  localDate: string;
  gymTime: string;
  status: WorkoutCheckStatus;
  hevyWorkoutId: string | null;
  reason: string | null;
};

export async function getWorkoutChecks(
  userProfileId: string,
  fromDate: string,
  toDate: string,
): Promise<Map<string, WorkoutCheck>> {
  const { data, error } = await supabase
    .from("health_workout_checks")
    .select("local_date, gym_time, status, hevy_workout_id, reason")
    .eq("user_profile_id", userProfileId)
    .gte("local_date", fromDate)
    .lte("local_date", toDate);
  const out = new Map<string, WorkoutCheck>();
  if (error || !data) {
    return out;
  }
  for (const r of data) {
    out.set(String(r.local_date), {
      localDate: String(r.local_date),
      gymTime: String(r.gym_time).slice(0, 5),
      status: r.status as WorkoutCheckStatus,
      hevyWorkoutId: r.hevy_workout_id ? String(r.hevy_workout_id) : null,
      reason: r.reason ? String(r.reason) : null,
    });
  }
  return out;
}

/** Inserts the day's first check result. Returns false when a check for that day already exists. */
export async function insertWorkoutCheck(userProfileId: string, check: WorkoutCheck): Promise<boolean> {
  const { data, error } = await supabase
    .from("health_workout_checks")
    .upsert(
      {
        user_profile_id: userProfileId,
        local_date: check.localDate,
        gym_time: check.gymTime,
        status: check.status,
        hevy_workout_id: check.hevyWorkoutId,
        reason: check.reason,
      },
      { onConflict: "user_profile_id,local_date", ignoreDuplicates: true },
    )
    .select("id");
  if (error) {
    logger.warn({ error: error.message }, "workout check insert failed");
    return false;
  }
  return (data ?? []).length > 0;
}

/** Records the person's answer (or a later Hevy match), creating the row if the check never ran. */
export async function saveWorkoutCheckAnswer(
  userProfileId: string,
  check: WorkoutCheck,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from("health_workout_checks").upsert(
    {
      user_profile_id: userProfileId,
      local_date: check.localDate,
      gym_time: check.gymTime,
      status: check.status,
      hevy_workout_id: check.hevyWorkoutId,
      reason: check.reason,
      answered_at: new Date().toISOString(),
    },
    { onConflict: "user_profile_id,local_date" },
  );
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Posts a message from the coach into the chat thread, with no model call. */
export async function postCoachMessage(
  userProfileId: string,
  content: string,
  cards: unknown[],
): Promise<void> {
  const { error } = await supabase
    .from("health_chat_messages")
    .insert({ user_profile_id: userProfileId, role: "assistant", content, cards });
  if (error) {
    logger.warn({ error: error.message }, "coach message save failed");
  }
}
