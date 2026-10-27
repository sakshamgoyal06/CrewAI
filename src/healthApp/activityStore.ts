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
  source: ActivitySource;
};

/** Upsert one day. Device pushes send the day's running total, so the latest value wins. */
export async function upsertDailyActivity(
  userProfileId: string,
  activity: DailyActivity,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.from("health_daily_activity").upsert(
    {
      user_profile_id: userProfileId,
      local_date: activity.localDate,
      steps: activity.steps,
      walk_minutes: activity.walkMinutes,
      walk_distance_m: activity.walkDistanceM,
      source: activity.source,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_profile_id,local_date" },
  );
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function getActivityRange(
  userProfileId: string,
  fromDate: string,
  toDate: string,
): Promise<Map<string, DailyActivity>> {
  const { data, error } = await supabase
    .from("health_daily_activity")
    .select("local_date, steps, walk_minutes, walk_distance_m, source")
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
      source: r.source as ActivitySource,
    });
  }
  return out;
}
