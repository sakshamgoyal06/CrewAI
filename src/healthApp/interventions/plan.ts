/**
 * The agreed plan and its versions. The plan is the goal (targets, start, deadline), the daily
 * targets and the routine. Every time the person agrees to a change, a numbered version is saved;
 * any earlier version can be restored, which itself saves a new version so nothing is lost.
 *
 * A trial is not a version: it changes the live routine or targets (so reminders and checks follow
 * it) while the agreed plan stays as it was. `agreedSnapshot` reads the live plan with running
 * trials taken back out, which is what versions store and what the headline shows.
 */
import { logger } from "../../logger.js";
import { supabase } from "../../tools/clients.js";
import { getActiveGoal, setActiveGoal, updateDailyTargets } from "../bodyStore.js";
import type { HealthGoal } from "../goalProgress.js";
import type { RoutineItem } from "../routine.js";
import { loadRoutine, saveRoutine } from "../routineStore.js";
import { loadHealthProfile } from "../snapshot.js";
import type { Change, Intervention } from "./types.js";

export type PlanTargets = { calorieTarget: number | null; proteinTarget: number | null; stepTarget: number };
export type PlanSnapshot = {
  goal: { targets: HealthGoal["targets"]; startDate: string; deadline: string } | null;
  targets: PlanTargets;
  routine: RoutineItem[];
};
export type PlanVersion = { id: string; version: number; snapshot: PlanSnapshot; reason: string; interventionId: string | null; createdAt: string };

export async function liveSnapshot(userProfileId: string): Promise<PlanSnapshot> {
  const [profile, goal, routine] = await Promise.all([loadHealthProfile(userProfileId), getActiveGoal(userProfileId), loadRoutine(userProfileId)]);
  return {
    goal: goal ? { targets: goal.targets, startDate: goal.startDate, deadline: goal.deadline } : null,
    targets: { calorieTarget: profile.targets.calorieTarget, proteinTarget: profile.targets.proteinTarget, stepTarget: profile.targets.stepTarget },
    routine: routine ?? [],
  };
}

/** Puts a change's values onto a snapshot. Pure. */
export function withChange(s: PlanSnapshot, c: Change | null): PlanSnapshot {
  if (!c) return s;
  const out: PlanSnapshot = { goal: s.goal ? { ...s.goal } : null, targets: { ...s.targets }, routine: s.routine.map((i) => ({ ...i })) };
  if (c.targets) {
    for (const [k, v] of Object.entries(c.targets)) if (v !== undefined) (out.targets as Record<string, unknown>)[k] = v;
  }
  if (c.routineItem) {
    out.routine = out.routine.map((i) => (i.id === c.routineItem!.itemId ? { ...i, ...c.routineItem!.patch } : i));
  }
  if (c.deadline && out.goal) out.goal.deadline = c.deadline;
  return out;
}

/** The live plan with every running trial taken back out: what the person actually agreed to. */
export function agreedSnapshot(live: PlanSnapshot, trials: Intervention[]): PlanSnapshot {
  return trials.filter((t) => t.status === "trial" || t.status === "confirm").reduce((s, t) => withChange(s, t.before), live);
}

/** The values a change would overwrite, as a change, so it can be put back exactly. Pure. */
export function beforeOf(s: PlanSnapshot, c: Change): Change {
  const out: Change = {};
  if (c.targets) {
    out.targets = {};
    for (const k of Object.keys(c.targets) as Array<keyof PlanTargets>) {
      const v = s.targets[k];
      if (v !== null && v !== undefined) (out.targets as Record<string, number>)[k] = v;
    }
  }
  if (c.routineItem) {
    const item = s.routine.find((i) => i.id === c.routineItem!.itemId);
    if (item) {
      const patch: Record<string, unknown> = {};
      for (const k of Object.keys(c.routineItem.patch)) patch[k] = (item as Record<string, unknown>)[k];
      out.routineItem = { itemId: item.id, patch };
    }
  }
  if (c.deadline && s.goal) out.deadline = s.goal.deadline;
  return out;
}

/** Writes the routine and target parts of a change to the live plan. Deadlines go through `applySnapshot`. */
export async function writeChange(userProfileId: string, c: Change): Promise<{ ok: boolean; error?: string }> {
  if (c.targets && Object.keys(c.targets).length) {
    const r = await updateDailyTargets(userProfileId, c.targets);
    if (!r.ok) return r;
  }
  if (c.routineItem) {
    const items = await loadRoutine(userProfileId);
    if (!items) return { ok: false, error: "routine_unavailable" };
    if (!items.some((i) => i.id === c.routineItem!.itemId)) return { ok: false, error: "item_gone" };
    const next = items.map((i) => (i.id === c.routineItem!.itemId ? { ...i, ...c.routineItem!.patch } : i));
    const r = await saveRoutine(userProfileId, next);
    if (!r.ok) return r;
  }
  return { ok: true };
}

/** Makes the live plan equal to a snapshot: goal, targets, routine (only what differs). */
export async function applySnapshot(userProfileId: string, target: PlanSnapshot, live: PlanSnapshot): Promise<{ ok: boolean; error?: string }> {
  const g = target.goal;
  if (g && (!live.goal || live.goal.deadline !== g.deadline || JSON.stringify(live.goal.targets) !== JSON.stringify(g.targets))) {
    const r = await setActiveGoal(userProfileId, {
      targetWeightKg: g.targets.weight_kg ?? null,
      targetBodyFatPct: g.targets.body_fat_pct ?? null,
      targetMuscleMassKg: g.targets.muscle_mass_kg ?? null,
      startDate: g.startDate,
      deadline: g.deadline,
    });
    if (!r.ok) return r;
  }
  const t = target.targets;
  const patch: Record<string, number> = {};
  if (t.calorieTarget !== null && t.calorieTarget !== live.targets.calorieTarget) patch.calorieTarget = t.calorieTarget;
  if (t.proteinTarget !== null && t.proteinTarget !== live.targets.proteinTarget) patch.proteinTarget = t.proteinTarget;
  if (t.stepTarget !== live.targets.stepTarget) patch.stepTarget = t.stepTarget;
  if (Object.keys(patch).length) {
    const r = await updateDailyTargets(userProfileId, patch);
    if (!r.ok) return r;
  }
  if (JSON.stringify(target.routine) !== JSON.stringify(live.routine)) {
    const r = await saveRoutine(userProfileId, target.routine);
    if (!r.ok) return r;
  }
  return { ok: true };
}

function versionFromRow(r: Record<string, unknown>): PlanVersion {
  return {
    id: String(r.id),
    version: Number(r.version),
    snapshot: r.snapshot as PlanSnapshot,
    reason: String(r.reason),
    interventionId: r.intervention_id ? String(r.intervention_id) : null,
    createdAt: String(r.created_at),
  };
}

export async function listVersions(userProfileId: string, limit = 30): Promise<PlanVersion[]> {
  const { data, error } = await supabase
    .from("health_plan_versions")
    .select("id, version, snapshot, reason, intervention_id, created_at")
    .eq("user_profile_id", userProfileId)
    .order("version", { ascending: false })
    .limit(limit);
  if (error) return [];
  return ((data ?? []) as Array<Record<string, unknown>>).map(versionFromRow);
}

/** Saves a new version unless it equals the latest one. */
export async function saveVersion(userProfileId: string, snapshot: PlanSnapshot, reason: string, interventionId: string | null = null): Promise<PlanVersion | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const [latest] = await listVersions(userProfileId, 1);
    if (latest && JSON.stringify(latest.snapshot) === JSON.stringify(snapshot)) return latest;
    const { data, error } = await supabase
      .from("health_plan_versions")
      .insert({ user_profile_id: userProfileId, version: (latest?.version ?? 0) + 1, snapshot, reason, intervention_id: interventionId })
      .select("id, version, snapshot, reason, intervention_id, created_at")
      .single();
    if (!error && data) return versionFromRow(data as Record<string, unknown>);
    if (error && !/duplicate|unique/i.test(error.message)) {
      logger.warn({ error: error.message }, "plan version save failed");
      return null;
    }
  }
  return null;
}

/** The first plan this goal was agreed with, so extensions are capped against its deadline. */
export function originalDeadline(versions: PlanVersion[], goal: PlanSnapshot["goal"]): string | null {
  if (!goal) return null;
  const same = versions.filter((v) => v.snapshot.goal && JSON.stringify(v.snapshot.goal.targets) === JSON.stringify(goal.targets) && v.snapshot.goal.startDate === goal.startDate);
  const first = same.sort((a, b) => a.version - b.version)[0];
  return first?.snapshot.goal?.deadline ?? goal.deadline;
}
