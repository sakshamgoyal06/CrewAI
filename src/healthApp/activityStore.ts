import { supabase } from "../tools/clients.js";

export const ACTIVITY_SOURCES = [
  "manual",
  "ios_shortcut",
  "health_auto_export",
  "health_connect",
  "api",
] as const;
export type ActivitySource = (typeof ACTIVITY_SOURCES)[number];

export type DailyActivity = {
  localDate: string;
  steps: number;
  walkMinutes: number | null;
  walkDistanceM: number | null;
  /** Active calories from the phone; left out of the write when unknown. */
  activeKcal?: number | null;
  /** Minutes asleep, credited to the day you woke up (Health Connect); left out when unknown. */
  sleepMinutes?: number | null;
  /** Resting heart rate in bpm (Health Connect); left out when unknown. */
  restingHr?: number | null;
  /** Total calories burned incl. resting metabolism, and average HRV (ms); left out when unknown. */
  totalKcal?: number | null;
  hrvMs?: number | null;
  source: ActivitySource;
};

/** Columns added by later migrations: a database without them still takes the steps. */
const OPTIONAL_COLUMNS = ["active_kcal", "sleep_minutes", "resting_hr", "total_kcal", "hrv_ms"] as const;

/** Upsert one day. Device pushes send the day's running total, so the latest value wins. */
export async function upsertDailyActivity(
  userProfileId: string,
  activity: DailyActivity,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const row: Record<string, unknown> = {
    user_profile_id: userProfileId,
    local_date: activity.localDate,
    steps: activity.steps,
    walk_minutes: activity.walkMinutes,
    walk_distance_m: activity.walkDistanceM,
    source: activity.source,
    updated_at: new Date().toISOString(),
  };
  if (activity.activeKcal != null) row.active_kcal = Math.round(activity.activeKcal);
  if (activity.sleepMinutes != null) row.sleep_minutes = Math.round(activity.sleepMinutes);
  if (activity.restingHr != null) row.resting_hr = Math.round(activity.restingHr);
  if (activity.totalKcal != null) row.total_kcal = Math.round(activity.totalKcal);
  if (activity.hrvMs != null) row.hrv_ms = Math.round(activity.hrvMs);
  const write = (r: Record<string, unknown>) =>
    supabase.from("health_daily_activity").upsert(r, { onConflict: "user_profile_id,local_date" });
  let { error } = await write(row);
  // Before a migration adds a column it doesn't exist; drop what the error names and keep the steps.
  for (let i = 0; error && i < OPTIONAL_COLUMNS.length; i++) {
    const missing = OPTIONAL_COLUMNS.filter((c) => c in row && error!.message.includes(c));
    if (!missing.length) break;
    for (const c of missing) delete row[c];
    ({ error } = await write(row));
  }
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function getActivityRange(
  userProfileId: string,
  fromDate: string,
  toDate: string,
): Promise<Map<string, DailyActivity>> {
  const { data, error } = await supabase
    .from("health_daily_activity")
    // `*`: optional columns arrive with later migrations; a missing one must not break reads.
    .select("*")
    .eq("user_profile_id", userProfileId)
    .gte("local_date", fromDate)
    .lte("local_date", toDate);
  const out = new Map<string, DailyActivity>();
  if (error || !data) {
    return out;
  }
  for (const r of data) {
    out.set(String(r.local_date), {
      localDate: String(r.local_date),
      steps: Number(r.steps) || 0,
      walkMinutes: r.walk_minutes === null ? null : Number(r.walk_minutes),
      walkDistanceM: r.walk_distance_m === null ? null : Number(r.walk_distance_m),
      sleepMinutes: r.sleep_minutes == null ? null : Number(r.sleep_minutes),
      restingHr: r.resting_hr == null ? null : Number(r.resting_hr),
      totalKcal: r.total_kcal == null ? null : Number(r.total_kcal),
      hrvMs: r.hrv_ms == null ? null : Number(r.hrv_ms),
      source: r.source as ActivitySource,
    });
  }
  return out;
}
