/**
 * The way back from a whole-plan pause (Saksham, 11 Nov, on the pause design doc):
 *
 * 1. Show where they stand: last logged weight and its date, days left to the goal date, days paused.
 * 2. Recommend moving the goal date by the days paused (safe).
 * 3. Keep the date: they log today's weight, Magnus works out the pace now needed. Past the safe
 *    limits (the same caps as every target: 1% of body weight a week for loss, 0.35 kg a week for
 *    gain, never under the calorie floor) it won't plan that and moves the date instead. Within
 *    them it shows exactly what changes (more steps first, up to +4,000 a day, then fewer calories)
 *    and locks in only when they accept.
 */
import { localDateKey } from "../nutrition/localDate.js";
import { logger } from "../logger.js";
import { addDays, dayNumber } from "../util/time.js";
import type { ActionContext } from "./actions.js";
import { lengthOf, loadBreaks, markResumed, type Break } from "./breaks.js";
import { getActiveGoal, getBodyCheckins, setActiveGoal, updateDailyTargets } from "./bodyStore.js";
import { loadCalorieReview } from "./calorieTarget.js";
import { loadHealthProfile } from "./snapshot.js";

/** Steps added before calories are cut, at most. */
export const MAX_EXTRA_STEPS = 4000;
/** A weigh-in older than this must be refreshed before keeping the date. */
export const FRESH_WEIGHT_DAYS = 7;

export type ResumeState = {
  breakId: string;
  pausedDays: number;
  deadline: string;
  movedDeadline: string;
  daysLeft: number;
  targetWeightKg: number | null;
  latestWeightKg: number | null;
  latestWeightDate: string | null;
  /** Keeping the date needs a fresh weigh-in first. */
  needsWeighIn: boolean;
};

/** The whole-plan pause still waiting for a restart choice: over (or ending today) and not answered. Pure. */
export function pendingResume(breaks: Break[], today: string): Break | null {
  return breaks.filter((b) => b.scope === "plan" && !b.resumedAt && b.endDate <= today && b.endDate >= addDays(today, -14)).sort((a, b) => b.endDate.localeCompare(a.endDate))[0] ?? null;
}

/** kcal a step burns, roughly, for this body weight. Pure. */
export const kcalPerStep = (kg: number): number => 0.0005 * kg;

export type KeepDatePlan =
  | { safe: false; safeDate: string | null; neededKgPerWeek: number | null }
  | {
      safe: true;
      neededKgPerWeek: number | null;
      calories: { from: number; to: number };
      steps: { from: number; to: number };
      /** What changes from the old plan, in plain words, for them to accept. */
      changes: string[];
    };

/**
 * Splits the extra daily deficit a kept date needs: steps first (to +4,000), then calories. For a
 * gain goal, only calories go up. Pure.
 */
export function keepDatePlan(input: { currentKcal: number; suggestedKcal: number; capped: boolean; safeDate: string | null; neededKgPerWeek: number | null; stepTarget: number; weightKg: number }): KeepDatePlan {
  if (input.capped) return { safe: false, safeDate: input.safeDate, neededKgPerWeek: input.neededKgPerWeek };
  const extra = input.currentKcal - input.suggestedKcal;
  const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
  if (extra <= 0) {
    const to = Math.round(input.suggestedKcal);
    return {
      safe: true,
      neededKgPerWeek: input.neededKgPerWeek,
      calories: { from: input.currentKcal, to },
      steps: { from: input.stepTarget, to: input.stepTarget },
      changes: to === input.currentKcal ? ["Nothing changes: your current plan still reaches the goal by the date."] : [`Calories: ${fmt(input.currentKcal)} → ${fmt(to)} a day.`],
    };
  }
  const per = kcalPerStep(input.weightKg);
  const steps = Math.min(MAX_EXTRA_STEPS, Math.ceil(extra / per / 500) * 500);
  const fromSteps = steps * per;
  const cut = Math.max(0, Math.round(extra - fromSteps));
  const kcalTo = input.currentKcal - cut;
  const changes = [`Steps: ${fmt(input.stepTarget)} → ${fmt(input.stepTarget + steps)} a day (about ${Math.round(steps / 100)} more minutes of walking).`];
  if (cut > 0) changes.push(`Calories: ${fmt(input.currentKcal)} → ${fmt(kcalTo)} a day (${fmt(cut)} less, taken from the meal plan's portions).`);
  changes.push("Everything else in your plan stays the same.");
  return { safe: true, neededKgPerWeek: input.neededKgPerWeek, calories: { from: input.currentKcal, to: kcalTo }, steps: { from: input.stepTarget, to: input.stepTarget + steps }, changes };
}

async function pending(ctx: ActionContext, breakId?: string): Promise<{ b: Break; today: string } | null> {
  const today = localDateKey(ctx.now ?? new Date(), ctx.timezone);
  const breaks = await loadBreaks(ctx.userProfileId, today);
  const b = breakId ? breaks.find((x) => x.id === breakId && x.scope === "plan" && !x.resumedAt) ?? null : pendingResume(breaks, today);
  return b ? { b, today } : null;
}

export async function resumeState(ctx: ActionContext, breakId?: string): Promise<({ ok: true } & ResumeState) | { ok: false; error: string }> {
  const p = await pending(ctx, breakId);
  if (!p) return { ok: false, error: "nothing_to_resume" };
  const goal = await getActiveGoal(ctx.userProfileId);
  if (!goal) return { ok: false, error: "no_goal" };
  const weights = (await getBodyCheckins(ctx.userProfileId, addDays(p.today, -180))).filter((c) => c.weight_kg != null);
  const last = weights.at(-1) ?? null;
  const pausedDays = lengthOf(p.b.startDate, p.b.endDate);
  return {
    ok: true,
    breakId: p.b.id,
    pausedDays,
    deadline: goal.deadline,
    movedDeadline: addDays(goal.deadline, pausedDays),
    daysLeft: Math.max(0, dayNumber(goal.deadline) - dayNumber(p.today)),
    targetWeightKg: goal.targets.weight_kg ?? null,
    latestWeightKg: last?.weight_kg ?? null,
    latestWeightDate: last?.localDate ?? null,
    needsWeighIn: !last || dayNumber(p.today) - dayNumber(last.localDate) > FRESH_WEIGHT_DAYS,
  };
}

type SetTargets = (t: { calorieTarget?: number; proteinTarget?: number }) => Promise<boolean>;

/** Recommended: the goal date moves later by the days paused, and the targets follow the new date. */
export async function resumeMoveDate(ctx: ActionContext, breakId: string, setTargets: SetTargets): Promise<{ ok: true; deadline: string; lines: string[] } | { ok: false; error: string }> {
  const state = await resumeState(ctx, breakId);
  if (!state.ok) return state;
  const before = await getActiveGoal(ctx.userProfileId);
  if (!before) return { ok: false, error: "no_goal" };
  const saved = await setActiveGoal(ctx.userProfileId, {
    targetWeightKg: before.targets.weight_kg ?? null,
    targetBodyFatPct: before.targets.body_fat_pct ?? null,
    targetMuscleMassKg: before.targets.muscle_mass_kg ?? null,
    startDate: before.startDate,
    deadline: state.movedDeadline,
    notes: `Moved ${state.pausedDays} days later after a pause`,
  });
  if (!saved.ok) return saved;
  const { replanForGoal } = await import("./replan.js");
  const replan = await replanForGoal(ctx, before, setTargets, ctx.now ?? new Date());
  await markResumed(ctx.userProfileId, breakId, "move_date");
  return { ok: true, deadline: state.movedDeadline, lines: replan?.lines ?? [] };
}

/** Keep the date: what it would take (after a fresh weigh-in), without changing anything yet. */
export async function keepDatePreview(ctx: ActionContext, breakId: string, weightKg?: number): Promise<({ ok: true } & KeepDatePlan) | { ok: false; error: string }> {
  const state = await resumeState(ctx, breakId);
  if (!state.ok) return state;
  if (weightKg) {
    const { logCheckin } = await import("./actions.js");
    const r = await logCheckin(ctx, { weightKg });
    if (!r.ok) return r;
  } else if (state.needsWeighIn) return { ok: false, error: "weigh_in_first" };
  const [review, profile] = await Promise.all([loadCalorieReview(ctx.userProfileId, ctx.now ?? new Date()), loadHealthProfile(ctx.userProfileId)]);
  if (review.status !== "ok") return { ok: false, error: "not_enough_data" };
  const current = profile.targets.calorieTarget ?? review.currentTarget ?? review.suggestedTarget;
  return {
    ok: true,
    ...keepDatePlan({
      currentKcal: Math.round(current),
      suggestedKcal: review.suggestedTarget,
      capped: review.cappedForSafety,
      safeDate: review.safeDate,
      neededKgPerWeek: review.neededKgPerWeek,
      stepTarget: profile.targets.stepTarget,
      weightKg: weightKg ?? review.trendWeightKg,
    }),
  };
}

/** They accepted the kept-date plan: worked out again on the server, then applied and the meal plan rebuilt. */
export async function keepDateAccept(ctx: ActionContext, breakId: string): Promise<({ ok: true } & KeepDatePlan) | { ok: false; error: string }> {
  const plan = await keepDatePreview(ctx, breakId);
  if (!plan.ok) return plan;
  if (!plan.safe) return { ok: false, error: "not_safe" };
  const saved = await updateDailyTargets(ctx.userProfileId, { calorieTarget: plan.calories.to, stepTarget: plan.steps.to });
  if (!saved.ok) return saved;
  const { rebuildPlan } = await import("./dietPlan/store.js");
  await rebuildPlan(ctx, "target_change", ctx.now ?? new Date()).catch((err) => logger.warn({ err }, "plan rebuild after resume failed"));
  await markResumed(ctx.userProfileId, breakId, "keep_date");
  return plan;
}
