import { supabase } from "../tools/clients.js";
import type { BodyCheckin, HealthGoal } from "./goalProgress.js";

type Result = { ok: true } | { ok: false; error: string };

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined) {
    return null;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function getActiveGoal(userProfileId: string): Promise<HealthGoal | null> {
  const { data, error } = await supabase
    .from("health_goals")
    .select("id, start_date, deadline, target_weight_kg, target_body_fat_pct, target_muscle_mass_kg")
    .eq("user_profile_id", userProfileId)
    .eq("status", "active")
    .maybeSingle();
  if (error || !data) {
    return null;
  }
  const targets: HealthGoal["targets"] = {};
  const w = numOrNull(data.target_weight_kg);
  const bf = numOrNull(data.target_body_fat_pct);
  const mm = numOrNull(data.target_muscle_mass_kg);
  if (w !== null) targets.weight_kg = w;
  if (bf !== null) targets.body_fat_pct = bf;
  if (mm !== null) targets.muscle_mass_kg = mm;
  return {
    id: String(data.id),
    startDate: String(data.start_date),
    deadline: String(data.deadline),
    targets,
  };
}

export type GoalInput = {
  targetWeightKg?: number | null;
  targetBodyFatPct?: number | null;
  targetMuscleMassKg?: number | null;
  startDate: string;
  deadline: string;
  notes?: string | null;
};

/** Replaces the active goal (the old one is kept as `replaced`). */
export async function setActiveGoal(
  userProfileId: string,
  input: GoalInput,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const { error: retireError } = await supabase
    .from("health_goals")
    .update({ status: "replaced", updated_at: new Date().toISOString() })
    .eq("user_profile_id", userProfileId)
    .eq("status", "active");
  if (retireError) {
    return { ok: false, error: retireError.message };
  }
  const { data, error } = await supabase
    .from("health_goals")
    .insert({
      user_profile_id: userProfileId,
      target_weight_kg: input.targetWeightKg ?? null,
      target_body_fat_pct: input.targetBodyFatPct ?? null,
      target_muscle_mass_kg: input.targetMuscleMassKg ?? null,
      start_date: input.startDate,
      deadline: input.deadline,
      notes: input.notes ?? null,
    })
    .select("id")
    .single();
  if (error || !data) {
    return { ok: false, error: error?.message ?? "insert failed" };
  }
  return { ok: true, id: String(data.id) };
}

export async function upsertBodyCheckin(
  userProfileId: string,
  checkin: BodyCheckin & { note?: string | null },
): Promise<Result> {
  const { error } = await supabase.from("health_body_checkins").upsert(
    {
      user_profile_id: userProfileId,
      local_date: checkin.localDate,
      weight_kg: checkin.weight_kg,
      body_fat_pct: checkin.body_fat_pct,
      muscle_mass_kg: checkin.muscle_mass_kg,
      note: checkin.note ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_profile_id,local_date" },
  );
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function getBodyCheckins(
  userProfileId: string,
  sinceDate: string,
): Promise<BodyCheckin[]> {
  const { data, error } = await supabase
    .from("health_body_checkins")
    .select("local_date, weight_kg, body_fat_pct, muscle_mass_kg")
    .eq("user_profile_id", userProfileId)
    .gte("local_date", sinceDate)
    .order("local_date", { ascending: true });
  if (error || !data) {
    return [];
  }
  return data.map((r) => ({
    localDate: String(r.local_date),
    weight_kg: numOrNull(r.weight_kg),
    body_fat_pct: numOrNull(r.body_fat_pct),
    muscle_mass_kg: numOrNull(r.muscle_mass_kg),
  }));
}

export type TargetsInput = {
  calorieTarget?: number | null;
  proteinTarget?: number | null;
  stepTarget?: number | null;
  trainingDays?: number[] | null;
};

export async function updateDailyTargets(
  userProfileId: string,
  input: TargetsInput,
): Promise<Result> {
  const patch: Record<string, unknown> = { user_profile_id: userProfileId };
  if (input.calorieTarget !== undefined) patch.daily_calorie_target = input.calorieTarget;
  if (input.proteinTarget !== undefined) patch.daily_protein_g_target = input.proteinTarget;
  if (input.stepTarget !== undefined) patch.daily_step_target = input.stepTarget;
  if (input.trainingDays !== undefined) patch.training_days = input.trainingDays;
  const { error } = await supabase
    .from("user_health_profile")
    .upsert(patch, { onConflict: "user_profile_id" });
  return error ? { ok: false, error: error.message } : { ok: true };
}
