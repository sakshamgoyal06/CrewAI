/**
 * The person's own data: a full export as JSON, and deleting the account. Every health table
 * references user_profile with ON DELETE CASCADE, so deleting the profile removes everything.
 */
import { logger } from "../logger.js";
import { supabase } from "../tools/clients.js";
import { forgetProfile } from "./accounts.js";
import { cancelRazorpaySubscription, razorpayConfig } from "./billing.js";

/** Tables exported in full (every column), all keyed by user_profile_id. */
export const EXPORT_TABLES = [
  "user_health_profile",
  "health_goals",
  "health_body_checkins",
  "meal_logs",
  "meal_daily_rollups",
  "meal_plan_entries",
  "health_daily_activity",
  "health_activity_samples",
  "health_activities",
  "health_water_logs",
  "health_my_foods",
  "health_routine_items",
  "health_routine_checks",
  "health_breaks",
  "health_minimum_days",
  "health_chat_messages",
  "health_coach_memory",
  "health_workout_checks",
  "health_hevy_proposals",
  "health_rca_reports",
  "health_interventions",
  "health_plan_versions",
  "health_diet_preferences",
  "health_diet_plans",
  "health_diet_plan_options",
  "health_diet_adjustments",
  "health_notifications",
  "user_subscriptions",
  "health_app_events",
] as const;

/**
 * Tables the code touches that are deliberately not in the export, and why. A test fails when
 * the code starts using a table that is in neither list, so a new feature can't skip the export.
 */
export const NOT_EXPORTED: Record<string, string> = {
  user_profile: "exported separately as `profile`",
  health_app_tokens: "credentials (hashes of device tokens)",
  user_integrations: "credentials (the Hevy key)",
  health_push_subscriptions: "credentials (push endpoint keys for this browser)",
  food_nutrition: "shared food table, not personal",
  food_recipes: "shared food table, not personal",
};

const PAGE = 1000;

async function allRows(table: string, userProfileId: string): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .eq("user_profile_id", userProfileId)
      .range(from, from + PAGE - 1);
    // A table from a migration that hasn't run yet has no rows to export.
    if (error && (error.code === "42P01" || error.code === "PGRST205")) return out;
    if (error) throw new Error(`export ${table}: ${error.message}`);
    out.push(...((data ?? []) as Record<string, unknown>[]));
    if (!data || data.length < PAGE) return out;
  }
}

export async function exportAccount(userProfileId: string, now = new Date()): Promise<Record<string, unknown>> {
  const profile = await supabase
    .from("user_profile")
    .select("id, display_name, email, timezone, created_at")
    .eq("id", userProfileId)
    .maybeSingle();
  if (profile.error) throw new Error(`export profile: ${profile.error.message}`);
  const tables: Record<string, unknown> = {};
  for (const t of EXPORT_TABLES) tables[t] = await allRows(t, userProfileId);
  return {
    exportedAt: now.toISOString(),
    format: "magnus-export-v1",
    profile: profile.data,
    // Credentials (the Hevy key, tokens) are never exported.
    ...tables,
  };
}

/** Deletes the profile (and with it every row) and the Google sign-in. */
export async function deleteAccount(userProfileId: string): Promise<{ ok: boolean; error?: string }> {
  const { data } = await supabase.from("user_profile").select("auth_user_id").eq("id", userProfileId).maybeSingle();
  const authUserId = (data as { auth_user_id?: string | null } | null)?.auth_user_id ?? null;

  // Stop future renewals before the row that tracks them is gone (best effort).
  const rzp = razorpayConfig();
  if (rzp) await cancelRazorpaySubscription(userProfileId, rzp).catch(() => undefined);

  const del = await supabase.from("user_profile").delete().eq("id", userProfileId);
  if (del.error) return { ok: false, error: del.error.message };
  forgetProfile(userProfileId);

  if (authUserId) {
    const { error } = await supabase.auth.admin.deleteUser(authUserId);
    if (error) logger.warn({ err: error.message }, "account deleted but auth user removal failed");
  }
  logger.info({ userProfileId }, "account deleted");
  return { ok: true };
}
