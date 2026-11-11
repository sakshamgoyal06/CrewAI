/**
 * Every write the app can make, with one validated input schema each. The tracker's forms (via
 * the router) and the coach chat (via Claude tools) both go through these, so a log from chat and
 * a log from the dashboard are the same row.
 */
import { z } from "zod";
import { mealContext } from "../meals/mealPhrases.js";

import { localDateKey } from "../nutrition/localDate.js";
import { addDays } from "../util/time.js";
import { logger } from "../logger.js";
import { loggableError } from "../util/loggableError.js";
import { ACTIVITY_SOURCES, upsertDailyActivity } from "./activityStore.js";
import { afterMealLogged, previewPlanRole, rebalanceToday, redoCarry } from "./dietPlan/rhythm.js";
import { unlinkDeletedMeal } from "./dietPlan/log.js";
import { setActiveGoal, updateDailyTargets, upsertBodyCheckin } from "./bodyStore.js";
import { isOwnerProfile } from "./accounts.js";
import { webGateFor } from "./webLookups.js";
import {
  deleteMeal,
  draftMeal,
  ESTIMATE_SOURCES,
  MEAL_SLOTS,
  saveConfirmedMeal,
  type ConfirmMealResult,
  type MealDraft,
} from "./meals.js";

const DRAFT_SLOTS = ["breakfast", "lunch", "dinner", "snack"] as const;
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
    /** Local "HH:MM" start of the gym slot on training days; null clears it. */
    gymTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "expected HH:MM")
      .nullable()
      .optional(),
    /** Weekday (0 = Sunday) for the weekly weigh-in; null = 7 days after the last one. */
    weighInDay: z.coerce.number().int().min(0).max(6).nullable().optional(),
    /** Minutes after the gym slot to check Hevy for a logged workout. */
    checkDelayMin: z.coerce.number().int().min(30).max(720).optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: "nothing to update" });

export const mealDraftInput = z.object({
  text: z.string().trim().min(2).max(500),
  slot: z.enum(MEAL_SLOTS).optional(),
  /** Added on top of the meal ("add a tea to breakfast"), never in place of the planned one. */
  extra: z.boolean().optional(),
  /** The foods as the coach read them (foodDbEstimate.ts ParsedFoodItem); looked up one by one. */
  items: z
    .array(
      z.object({
        food: z.string().trim().min(1).max(120),
        quantity: z.coerce.number().positive().max(5000).optional(),
        unit: z.string().trim().max(20).optional(),
        size: z.enum(["small", "medium", "large"]).optional(),
        notes: z.string().trim().max(120).optional(),
      }),
    )
    .min(1)
    .max(12)
    .optional(),
  /** An earlier day they're telling us about ("yesterday's dinner"), YYYY-MM-DD; default today. */
  date: DATE.optional(),
});

/** How far back a meal can be filled in from chat. */
export const BACKFILL_DAYS = 30;

/** The day a drafted meal is for: the date given, "yesterday" in the text, else today. Never ahead of today or past the backfill window. */
export function draftDayFor(input: { date?: string; yesterday?: boolean }, today: string): string {
  const want = input.date ?? (input.yesterday ? addDays(today, -1) : today);
  return want > today || want < addDays(today, -BACKFILL_DAYS) ? today : want;
}

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
  /** From the draft: an extra on the slot, so it doesn't take the planned meal's place. */
  extra: z.boolean().optional(),
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
  /** webFirst: "Can't find it? Search", after the food list didn't have it (estimateMealNutrition.ts). */
  how: { webFirst?: boolean } = {},
): Promise<MealDraft> {
  const [gate, trusted] = await Promise.all([
    webGateFor(ctx.userProfileId, ctx.timezone, ctx.now),
    isOwnerProfile(ctx.userProfileId).catch(() => false),
  ]);
  // "I had poha for breakfast": the food is "poha" and the slot is breakfast.
  const typed = mealContext(input.text);
  const draft = await draftMeal({
    text: typed.text,
    slot: input.slot ?? typed.slot,
    timezone: ctx.timezone,
    now: ctx.now,
    options: { webAllowed: gate.allowed, onWebLookup: gate.onLookup, contributor: { id: ctx.userProfileId, trusted }, webFirst: how.webFirst, items: input.items },
  });
  if (!gate.allowed && draft.source !== "food_db") {
    const note = "This month's web lookups are used up, so this is a rougher estimate. Check the numbers.";
    draft.servingAssumption = draft.servingAssumption ? `${draft.servingAssumption} ${note}` : note;
  }
  const extra = input.extra === true || typed.extra === true;
  if (extra) draft.extra = true;
  // Say on the card, before it's logged, whether it replaces the planned meal or sits on top.
  const day = draftDayFor({ date: input.date, yesterday: typed.yesterday }, localDateKey(ctx.now ?? new Date(), ctx.timezone));
  draft.date = day;
  const preview = (slot: typeof draft.slot) =>
    previewPlanRole(ctx.userProfileId, day, slot, { extra }).catch((err) => {
      logger.warn({ err: loggableError(err) }, "meal draft plan preview failed");
      return null;
    });
  // "I had 2 roti and dal today" names no meal: never guess, the card asks which one.
  const said = (input.slot && input.slot !== "unspecified") || !!typed.slot;
  if (!said && !how.webFirst) {
    draft.slotUnsure = true;
    const roles = await Promise.all(DRAFT_SLOTS.map(async (s) => [s, await preview(s)] as const));
    draft.planBySlot = Object.fromEntries(roles.filter(([, r]) => r)) as MealDraft["planBySlot"];
    return draft;
  }
  const plan = await preview(draft.slot);
  if (plan) draft.plan = plan;
  return draft;
}

export async function confirmMeal(
  ctx: ActionContext,
  input: z.infer<typeof mealConfirmInput>,
): Promise<ConfirmMealResult> {
  const date = resolveDate(ctx, input.date);
  if (typeof date !== "string") return { ok: false, ...date };
  const saved = await saveConfirmedMeal(
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
  // The meal plan follows: the log takes a still-planned meal's place, or is an extra; the rest of
  // today is resized in the background. A failure here never fails the log.
  if (saved.ok && !saved.alreadySaved) {
    const plan = await afterMealLogged(ctx, { date, slot: input.slot, mealSessionId: saved.mealSessionId, extra: input.extra }, ctx.now).catch((err) => {
      logger.warn({ err: loggableError(err) }, "meal plan follow-up failed");
      return null;
    });
    return plan ? { ...saved, plan } : saved;
  }
  return saved;
}

export async function removeMeal(
  ctx: ActionContext,
  mealSessionId: string,
): Promise<ActionResult<{ date: string }>> {
  if (!z.string().uuid().safeParse(mealSessionId).success) {
    return { ok: false, error: "invalid_id" };
  }
  const r = await deleteMeal(ctx.userProfileId, mealSessionId, ctx.timezone);
  if (!r.ok) return r;
  // The planned meal it stood for is planned again, and today's meals still to come resize to fit.
  await unlinkDeletedMeal(ctx.userProfileId, mealSessionId).catch((err) => logger.warn({ err: loggableError(err) }, "unlink after meal delete failed"));
  if (r.localDate === localDateKey(ctx.now ?? new Date(), ctx.timezone)) {
    await rebalanceToday(ctx).catch((err) => logger.warn({ err: loggableError(err) }, "rebalance after meal delete failed"));
  } else {
    // A closed day lost a meal (a double count removed): its carry is worked out again.
    await redoCarry(ctx, r.localDate).catch((err) => logger.warn({ err: loggableError(err) }, "carry redo after meal delete failed"));
  }
  return { ok: true, date: r.localDate };
}
