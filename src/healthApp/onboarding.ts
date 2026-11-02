/**
 * First run: a short interview (body, goal, deadline, routine, diet) becomes a starting plan.
 *
 * Until there are 7 logged days and a weight trend, the adaptive target (`calorieTarget.ts`) has
 * nothing to learn from, so day 1 needs a formula:
 *
 *   BMR         = Mifflin-St Jeor (10·kg + 6.25·cm − 5·age + 5 for men, −161 for women)
 *   maintenance = BMR × activity factor (+ a little per training day)
 *   target      = maintenance + needed pace × 7,700 kcal/kg, capped at a safe pace
 *
 * The same safety caps as the adaptive target apply: lose at most 1% of body weight a week, gain
 * at most 0.35 kg a week, never more than 1,000 kcal under or 500 over, never under the floor.
 * When the deadline needs more than that, the plan says so and gives the date the safe pace hits.
 */
import { z } from "zod";
import { logger } from "../logger.js";

import { localDateKey } from "../nutrition/localDate.js";
import { supabase } from "../tools/clients.js";
import { logCheckin, setGoal, setTargets, type ActionContext } from "./actions.js";
import { KCAL_PER_KG } from "./calorieTarget.js";
import { postCoachMessage } from "./workoutCheckStore.js";

const DAY_MS = 86_400_000;
const dayNumber = (date: string): number => Math.round(Date.parse(`${date}T00:00:00Z`) / DAY_MS);
const dateOf = (n: number): string => new Date(n * DAY_MS).toISOString().slice(0, 10);
const to50 = (n: number): number => Math.round(n / 50) * 50;
const to5 = (n: number): number => Math.round(n / 5) * 5;
const r2 = (n: number): number => Math.round(n * 100) / 100;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2027-03-01" → "1 Mar 2027". */
export const humanDate = (d: string): string => `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;

const ACTIVITY_FACTOR = { desk: 1.2, light: 1.35, active: 1.5 } as const;
const PER_TRAINING_DAY = 0.025;
const MAX_LOSS_SHARE_PER_WEEK = 0.01;
const MAX_GAIN_KG_PER_WEEK = 0.35;
const MAX_DEFICIT = 1000;
const MAX_SURPLUS = 500;
const RECOMP_DEFICIT = 250;
const LEAN_GAIN_SURPLUS = 250;
const FLOOR = { male: 1500, female: 1200 } as const;

export const DIETS = ["vegetarian", "eggetarian", "non_vegetarian", "vegan", "jain", "custom"] as const;

/** A custom diet in their own words, and foods to avoid (allergies, intolerances, dislikes). */
export const foodPrefsShape = {
  diet: z.enum(DIETS),
  dietNote: z.string().trim().max(200).optional().nullable(),
  foodAvoid: z.array(z.string().trim().min(1).max(40)).max(25).default([]),
};

export const foodPrefsInput = z
  .object(foodPrefsShape)
  .refine((v) => v.diet !== "custom" || !!v.dietNote, { message: "describe your diet", path: ["dietNote"] });

/** De-duplicated, trimmed avoid list as stored. */
export function cleanAvoidList(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    const item = raw.trim().replace(/\s+/g, " ");
    const key = item.toLowerCase();
    if (item && !seen.has(key)) {
      seen.add(key);
      out.push(item);
    }
  }
  return out;
}

export const onboardingInput = z
  .object({
    sex: z.enum(["male", "female"]),
    birthYear: z.coerce.number().int().min(1930).max(new Date().getUTCFullYear() - 14),
    heightCm: z.coerce.number().min(120).max(230),
    weightKg: z.coerce.number().min(30).max(300),
    bodyFatPct: z.coerce.number().min(3).max(60).optional(),
    goalType: z.enum(["lose", "recomp", "gain"]),
    targetWeightKg: z.coerce.number().min(30).max(300).optional(),
    targetBodyFatPct: z.coerce.number().min(3).max(60).optional(),
    deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    activity: z.enum(["desk", "light", "active"]),
    trainingDays: z.array(z.coerce.number().int().min(0).max(6)).max(7).default([]),
    gymTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .nullable()
      .optional(),
    ...foodPrefsShape,
  })
  .refine((v) => v.diet !== "custom" || !!v.dietNote, { message: "describe your diet", path: ["dietNote"] })
  .refine((v) => v.goalType === "recomp" || v.targetWeightKg !== undefined || v.targetBodyFatPct !== undefined, {
    message: "need a target weight or body fat",
    path: ["targetWeightKg"],
  });

export type OnboardingInput = z.infer<typeof onboardingInput>;

export type StartingPlan = {
  bmrKcal: number;
  maintenanceKcal: number;
  calorieTarget: number;
  proteinTarget: number;
  stepTarget: number;
  /** Weight the plan aims for (derived from a body fat target when no weight target was given). */
  targetWeightKg: number | null;
  /** Pace the deadline needs, before the safety caps (kg/week, negative = losing). */
  neededKgPerWeek: number | null;
  /** Pace the calorie target aims for. */
  plannedKgPerWeek: number;
  cappedForSafety: boolean;
  /** When capped: the date the safe pace reaches the target. */
  safeDate: string | null;
  weeksLeft: number;
  lines: string[];
};

/** The day-1 plan. Pure. */
export function startingPlan(input: OnboardingInput, today: string): StartingPlan {
  const age = Number(today.slice(0, 4)) - input.birthYear;
  const bmr = 10 * input.weightKg + 6.25 * input.heightCm - 5 * age + (input.sex === "male" ? 5 : -161);
  const factor = ACTIVITY_FACTOR[input.activity] + PER_TRAINING_DAY * Math.min(6, input.trainingDays.length);
  const maintenance = bmr * factor;

  // A body fat target with no weight target: keep lean mass, change fat.
  let targetW = input.targetWeightKg ?? null;
  if (targetW === null && input.targetBodyFatPct !== undefined && input.bodyFatPct !== undefined) {
    const lean = input.weightKg * (1 - input.bodyFatPct / 100);
    targetW = Math.round((lean / (1 - input.targetBodyFatPct / 100)) * 10) / 10;
  }

  const daysLeft = Math.max(1, dayNumber(input.deadline) - dayNumber(today));
  const weeksLeft = Math.round((daysLeft / 7) * 10) / 10;
  const neededPerDay = targetW !== null && input.goalType !== "recomp" ? (targetW - input.weightKg) / daysLeft : null;

  let delta: number;
  let capped = false;
  if (neededPerDay === null) {
    delta = input.goalType === "gain" ? LEAN_GAIN_SURPLUS : input.goalType === "lose" ? -500 : -RECOMP_DEFICIT;
  } else {
    const maxLoss = (MAX_LOSS_SHARE_PER_WEEK * input.weightKg) / 7;
    const maxGain = MAX_GAIN_KG_PER_WEEK / 7;
    const safePerDay = Math.max(-maxLoss, Math.min(maxGain, neededPerDay));
    delta = Math.max(-MAX_DEFICIT, Math.min(MAX_SURPLUS, safePerDay * KCAL_PER_KG));
    capped = Math.abs(delta - neededPerDay * KCAL_PER_KG) > 1;
  }
  const floor = FLOOR[input.sex];
  let calorieTarget = Math.min(6000, Math.max(floor, to50(maintenance + delta)));
  if (calorieTarget === floor && maintenance + delta < floor) capped = neededPerDay !== null || capped;
  const plannedPerDay = (calorieTarget - maintenance) / KCAL_PER_KG;

  let safeDate: string | null = null;
  if (capped && targetW !== null && plannedPerDay !== 0 && Math.sign(targetW - input.weightKg) === Math.sign(plannedPerDay)) {
    safeDate = dateOf(dayNumber(today) + Math.ceil((targetW - input.weightKg) / plannedPerDay));
  }

  // Protein: 2.2 g per kg of lean mass when body fat is known, else per kg of the leaner of now/target.
  const lean = input.bodyFatPct !== undefined ? input.weightKg * (1 - input.bodyFatPct / 100) : null;
  const basis = input.goalType === "gain" ? input.weightKg : Math.min(input.weightKg, targetW ?? input.weightKg);
  const proteinTarget = Math.min(300, Math.max(60, to5(lean !== null ? lean * 2.2 : basis * (input.goalType === "gain" ? 1.8 : 2.0))));
  const stepTarget = input.activity === "active" ? 10000 : 8000;

  const plannedKgPerWeek = r2(plannedPerDay * 7);
  const neededKgPerWeek = neededPerDay === null ? null : r2(neededPerDay * 7);
  const kcal = (n: number) => `${Math.round(n).toLocaleString("en-US")} kcal`;
  const kgw = (n: number) => `${Math.abs(n).toFixed(2)} kg a week`;
  const lines: string[] = [];
  lines.push(`Your maintenance is about ${kcal(to50(maintenance))} a day. That's a formula estimate; after a week of logging and a couple of weigh-ins I'll replace it with your real number.`);
  if (input.goalType === "recomp" && neededPerDay === null) {
    lines.push(`For a recomp: ${kcal(calorieTarget)} a day, a small deficit, with protein high so the scale moves slowly while you get leaner.`);
  } else {
    const dir = plannedPerDay < 0 ? "lose" : "gain";
    lines.push(`Eat ${kcal(calorieTarget)} a day to ${dir} about ${kgw(plannedKgPerWeek)}.`);
  }
  if (targetW !== null && input.goalType !== "recomp") {
    if (capped) {
      lines.push(
        safeDate
          ? `${targetW} kg by ${humanDate(input.deadline)} needs ${kgw(neededKgPerWeek ?? 0)}, faster than is safe. At a safe pace you'll get there around ${humanDate(safeDate)}. I'll keep both dates in view.`
          : `${targetW} kg by ${humanDate(input.deadline)} needs a faster pace than is safe, so the target holds you at the safe limit.`,
      );
    } else {
      lines.push(`That reaches ${targetW} kg by ${humanDate(input.deadline)}, ${Math.round(weeksLeft)} weeks from now.`);
    }
  }
  lines.push(`Protein ${proteinTarget} g a day and ${stepTarget.toLocaleString("en-US")} steps.`);
  lines.push(`A day counts as on track when you log 3 meals, land at 60–100% of the calorie target, hit protein and steps, and train on training days. Aim for 5 of 7.`);

  return {
    bmrKcal: Math.round(bmr),
    maintenanceKcal: to50(maintenance),
    calorieTarget,
    proteinTarget,
    stepTarget,
    targetWeightKg: targetW,
    neededKgPerWeek,
    plannedKgPerWeek,
    cappedForSafety: capped,
    safeDate,
    weeksLeft,
    lines,
  };
}

const DIET_LABEL: Record<(typeof DIETS)[number], string> = {
  vegetarian: "vegetarian",
  eggetarian: "vegetarian plus eggs",
  non_vegetarian: "non-vegetarian",
  vegan: "vegan",
  jain: "Jain (no root vegetables, no eggs or meat)",
  custom: "custom",
};

/** One line for the coach: the diet, and what never to suggest. */
export function foodPrefsLine(d: { diet?: unknown; diet_note?: unknown; food_avoid?: unknown }): string | null {
  const diet = d.diet === "custom"
    ? (d.diet_note ? `diet (their words): ${String(d.diet_note)}` : null)
    : d.diet
      ? `diet: ${DIET_LABEL[d.diet as (typeof DIETS)[number]] ?? String(d.diet)}${d.diet_note ? ` (${String(d.diet_note)})` : ""}`
      : null;
  const avoid = Array.isArray(d.food_avoid) && d.food_avoid.length
    ? `must avoid (allergy, intolerance or won't eat; never suggest these or dishes containing them): ${d.food_avoid.map(String).join(", ")}`
    : null;
  return [diet, avoid].filter(Boolean).join("; ") || null;
}

export async function isOnboarded(userProfileId: string): Promise<boolean> {
  const [hp, goal] = await Promise.all([
    supabase.from("user_health_profile").select("onboarded_at").eq("user_profile_id", userProfileId).maybeSingle(),
    supabase.from("health_goals").select("id").eq("user_profile_id", userProfileId).limit(1),
  ]);
  // Someone who already set a goal (the owner, before onboarding existed) never sees it.
  return !!(hp.data as { onboarded_at?: string | null } | null)?.onboarded_at || (goal.data ?? []).length > 0;
}

/** The person's own details, for the coach's prompt. Null before onboarding. */
export async function loadPersonalDetails(userProfileId: string): Promise<string | null> {
  const { data } = await supabase
    .from("user_health_profile")
    .select("sex, birth_year, height_cm, activity_level, diet, diet_note, food_avoid, goal_type")
    .eq("user_profile_id", userProfileId)
    .maybeSingle();
  const d = (data ?? null) as Record<string, unknown> | null;
  if (!d || !d.sex) return null;
  const parts = [
    `${String(d.sex)}`,
    d.birth_year ? `born ${String(d.birth_year)}` : null,
    d.height_cm ? `${String(d.height_cm)} cm` : null,
    d.activity_level ? `${String(d.activity_level)} job/day` : null,
    foodPrefsLine(d),
    d.goal_type ? `goal type: ${String(d.goal_type)}` : null,
  ];
  return parts.filter(Boolean).join(", ");
}

/** Saves everything from the interview, writes the plan as targets, and greets the person in chat. */
export async function completeOnboarding(
  ctx: ActionContext,
  input: OnboardingInput,
  now = new Date(),
): Promise<{ ok: true; plan: StartingPlan } | { ok: false; error: string }> {
  const today = localDateKey(now, ctx.timezone);
  if (dayNumber(input.deadline) <= dayNumber(today)) return { ok: false, error: "deadline_must_be_after_start" };
  const plan = startingPlan(input, today);

  const row = {
    user_profile_id: ctx.userProfileId,
    sex: input.sex,
    birth_year: input.birthYear,
    height_cm: input.heightCm,
    activity_level: input.activity,
    diet: input.diet,
    diet_note: input.dietNote?.trim() || null,
    food_avoid: cleanAvoidList(input.foodAvoid),
    goal_type: input.goalType,
    onboarded_at: now.toISOString(),
  };
  let profile = await supabase.from("user_health_profile").upsert(row, { onConflict: "user_profile_id" });
  if (profile.error && /diet_note|food_avoid|diet_check/.test(profile.error.message)) {
    // The food-preferences migration isn't applied yet: save the rest rather than block sign-up.
    logger.warn({ err: profile.error.message }, "food preferences not saved (migration pending)");
    const { diet_note: _n, food_avoid: _a, ...legacy } = row;
    profile = await supabase
      .from("user_health_profile")
      .upsert({ ...legacy, diet: input.diet === "custom" ? null : input.diet }, { onConflict: "user_profile_id" });
  }
  if (profile.error) return { ok: false, error: profile.error.message };

  const checkin = await logCheckin(ctx, { date: today, weightKg: input.weightKg, bodyFatPct: input.bodyFatPct });
  if (!checkin.ok) return { ok: false, error: checkin.error ?? "checkin_failed" };

  // Recomp with no number to hit still gets a goal: hold weight, by the deadline.
  const goal = await setGoal(ctx, {
    targetWeightKg: input.goalType === "recomp" && plan.targetWeightKg === null ? input.weightKg : (plan.targetWeightKg ?? undefined),
    targetBodyFatPct: input.targetBodyFatPct,
    deadline: input.deadline,
    startDate: today,
  });
  if (!goal.ok) return { ok: false, error: goal.error ?? "goal_failed" };

  const targets = await setTargets(ctx, {
    calorieTarget: plan.calorieTarget,
    proteinTarget: plan.proteinTarget,
    stepTarget: plan.stepTarget,
    trainingDays: input.trainingDays,
    gymTime: input.gymTime ?? null,
  });
  if (!targets.ok) return { ok: false, error: targets.error ?? "targets_failed" };

  await postCoachMessage(
    ctx.userProfileId,
    [
      "Here's your plan.",
      ...plan.lines,
      "Start by telling me what you ate today, in a sentence or a photo. I'll estimate it, you fix anything that's off, and it's logged.",
    ].join("\n\n"),
    [],
  );
  return { ok: true, plan };
}

export type FoodPrefs = { diet: (typeof DIETS)[number] | null; dietNote: string | null; foodAvoid: string[] };

export async function loadFoodPrefs(userProfileId: string): Promise<FoodPrefs> {
  const { data } = await supabase
    .from("user_health_profile")
    .select("diet, diet_note, food_avoid")
    .eq("user_profile_id", userProfileId)
    .maybeSingle();
  const d = (data ?? {}) as { diet?: FoodPrefs["diet"]; diet_note?: string | null; food_avoid?: string[] | null };
  return { diet: d.diet ?? null, dietNote: d.diet_note ?? null, foodAvoid: d.food_avoid ?? [] };
}

export async function saveFoodPrefs(userProfileId: string, input: z.infer<typeof foodPrefsInput>): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from("user_health_profile")
    .upsert(
      {
        user_profile_id: userProfileId,
        diet: input.diet,
        diet_note: input.dietNote?.trim() || null,
        food_avoid: cleanAvoidList(input.foodAvoid),
      },
      { onConflict: "user_profile_id" },
    );
  return error ? { ok: false, error: error.message } : { ok: true };
}
