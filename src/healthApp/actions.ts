/**
 * Every write the app can make, with one validated input schema each. The tracker's forms (via
 * the router) and the coach chat (via Claude tools) both go through these, so a log from chat and
 * a log from the dashboard are the same row.
 */
import { z } from "zod";

import { localDateKey } from "../nutrition/localDate.js";
import { ACTIVITY_SOURCES, upsertDailyActivity } from "./activityStore.js";
import { setActiveGoal, updateDailyTargets, upsertBodyCheckin } from "./bodyStore.js";
import {
  deleteMeal,
  draftMeal,
  ESTIMATE_SOURCES,
  MEAL_SLOTS,
  saveConfirmedMeal,
  type ConfirmMealResult,
  type MealDraft,
} from "./meals.js";

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");
const num = (min: number, max: number) => z.coerce.number().min(min).max(max);

export const stepsInput = z.object({
  date: DATE.optional(),
  steps: z.coerce.number().int().min(0).max(200_000),
  walkMinutes: z.coerce.number().int().min(0).max(1440).optional(),
  walkDistanceM: z.coerce.number().int().min(0).max(500_000).optional(),
  source: z.enum(ACTIVITY_SOURCES).optional(),
});

export const checkinInput = z
  .object({
    date: DATE.optional(),
    weightKg: num(25, 350).optional(),
    bodyFatPct: num(2, 70).optional(),
    muscleMassKg: num(10, 150).optional(),
    note: z.string().max(500).optional(),
  })
  .refine((v) => v.weightKg !== undefined || v.bodyFatPct !== undefined || v.muscleMassKg !== undefined, {
    message: "need at least one of weightKg, bodyFatPct, muscleMassKg",
  });

export const goalInput = z
  .object({
    targetWeightKg: num(25, 350).optional(),
    targetBodyFatPct: num(2, 70).optional(),
    targetMuscleMassKg: num(10, 150).optional(),
    deadline: DATE,
    startDate: DATE.optional(),
    notes: z.string().max(500).optional(),
  })
  .refine(
    (v) =>
      v.targetWeightKg !== undefined ||
      v.targetBodyFatPct !== undefined ||
      v.targetMuscleMassKg !== undefined,
    { message: "need at least one target" },
  );

export const targetsInput = z
  .object({
    calorieTarget: z.coerce.number().int().min(800).max(6000).optional(),
    proteinTarget: z.coerce.number().int().min(20).max(400).optional(),
    stepTarget: z.coerce.number().int().min(1000).max(50_000).optional(),
    trainingDays: z.array(z.coerce.number().int().min(0).max(6)).max(7).optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: "nothing to update" });

export const mealDraftInput = z.object({
  text: z.string().trim().min(2).max(500),
  slot: z.enum(MEAL_SLOTS).optional(),
});

const mealItem = z.object({
  name: z.string().trim().min(1).max(200),
  calories: z.coerce.number().min(0).max(5000),
  protein_g: z.coerce.number().min(0).max(500),
  carbs_g: z.coerce.number().min(0).max(1000),
  fat_g: z.coerce.number().min(0).max(500),
});

export const mealConfirmInput = z.object({
  draftId: z.string().uuid(),
  text: z.string().trim().min(1).max(500),
  slot: z.enum(MEAL_SLOTS),
  source: z.enum(ESTIMATE_SOURCES),
  items: z.array(mealItem).min(1).max(30),
  edited: z.boolean().default(false),
  date: DATE.optional(),
});

export type ActionContext = { userProfileId: string; timezone: string; now?: Date };

export type ActionResult<T = Record<string, unknown>> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

function today(ctx: ActionContext): string {
  return localDateKey(ctx.now ?? new Date(), ctx.timezone);
}

/** Rejects dates after today in the user's timezone. */
function resolveDate(ctx: ActionContext, date: string | undefined): string | { error: string } {
  const t = today(ctx);
  const d = date ?? t;
  return d > t ? { error: "future_date" } : d;
}

export async function logSteps(
  ctx: ActionContext,
  input: z.infer<typeof stepsInput>,
): Promise<ActionResult<{ date: string; steps: number }>> {
  const date = resolveDate(ctx, input.date);
  if (typeof date !== "string") return { ok: false, ...date };
  const saved = await upsertDailyActivity(ctx.userProfileId, {
    localDate: date,
    steps: input.steps,
    walkMinutes: input.walkMinutes ?? null,
    walkDistanceM: input.walkDistanceM ?? null,
    source: input.source ?? "api",
  });
  return saved.ok ? { ok: true, date, steps: input.steps } : saved;
}

export async function logCheckin(
  ctx: ActionContext,
  input: z.infer<typeof checkinInput>,
): Promise<ActionResult<{ date: string }>> {
  const date = resolveDate(ctx, input.date);
  if (typeof date !== "string") return { ok: false, ...date };
  const saved = await upsertBodyCheckin(ctx.userProfileId, {
    localDate: date,
    weight_kg: input.weightKg ?? null,
    body_fat_pct: input.bodyFatPct ?? null,
    muscle_mass_kg: input.muscleMassKg ?? null,
    note: input.note ?? null,
  });
  return saved.ok ? { ok: true, date } : saved;
}

export async function setGoal(
  ctx: ActionContext,
  input: z.infer<typeof goalInput>,
): Promise<ActionResult<{ goalId: string }>> {
  const startDate = input.startDate ?? today(ctx);
  if (input.deadline <= startDate) {
    return { ok: false, error: "deadline_must_be_after_start" };
  }
  const saved = await setActiveGoal(ctx.userProfileId, {
    targetWeightKg: input.targetWeightKg ?? null,
    targetBodyFatPct: input.targetBodyFatPct ?? null,
    targetMuscleMassKg: input.targetMuscleMassKg ?? null,
    startDate,
    deadline: input.deadline,
    notes: input.notes ?? null,
  });
  return saved.ok ? { ok: true, goalId: saved.id } : saved;
}

export async function setTargets(
  ctx: ActionContext,
  input: z.infer<typeof targetsInput>,
): Promise<ActionResult> {
  const trainingDays = input.trainingDays ? [...new Set(input.trainingDays)].sort() : undefined;
  const saved = await updateDailyTargets(ctx.userProfileId, { ...input, trainingDays });
  return saved.ok ? { ok: true } : saved;
}

export async function startMealDraft(
  ctx: ActionContext,
  input: z.infer<typeof mealDraftInput>,
): Promise<MealDraft> {
  return draftMeal({ text: input.text, slot: input.slot, timezone: ctx.timezone, now: ctx.now });
}

export async function confirmMeal(
  ctx: ActionContext,
  input: z.infer<typeof mealConfirmInput>,
): Promise<ConfirmMealResult> {
  const date = resolveDate(ctx, input.date);
  if (typeof date !== "string") return { ok: false, ...date };
  return saveConfirmedMeal(
    ctx.userProfileId,
    {
      draftId: input.draftId,
      text: input.text,
      slot: input.slot,
      source: input.source,
      items: input.items,
      edited: input.edited,
      localDate: date,
    },
    ctx.now,
  );
}

export async function removeMeal(
  ctx: ActionContext,
  mealSessionId: string,
): Promise<ActionResult<{ date: string }>> {
  if (!z.string().uuid().safeParse(mealSessionId).success) {
    return { ok: false, error: "invalid_id" };
  }
  const r = await deleteMeal(ctx.userProfileId, mealSessionId, ctx.timezone);
  return r.ok ? { ok: true, date: r.localDate } : r;
}
