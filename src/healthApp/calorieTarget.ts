/**
 * Adaptive calorie target: works out the person's real maintenance from what they logged and how
 * their weight actually moved, then the daily target that keeps them on pace for the goal.
 *
 *   maintenance = average logged intake − (weight trend kg/day × 7,700 kcal/kg)
 *   target      = maintenance + (needed kg/day × 7,700)
 *
 * Only well-logged days count (2+ meals and 800+ kcal), so a half-logged day doesn't read as a
 * huge deficit. The pace is capped at a safe rate (1% of body weight a week to lose, 0.35 kg a
 * week to gain) and the deficit at 1,000 kcal; when the deadline needs more than that, the review
 * says so and gives the date the safe pace reaches the goal instead. Pure, so it's easy to test.
 */
import { localDateKey } from "../nutrition/localDate.js";
import { getActiveGoal, getBodyCheckins } from "./bodyStore.js";
import { slopePerDay, type BodyCheckin, type HealthGoal } from "./goalProgress.js";
import { loadHealthProfile, loadMealDays } from "./snapshot.js";

export const KCAL_PER_KG = 7700;
export const REVIEW_WINDOW_DAYS = 28;
export const MIN_LOGGED_DAYS = 7;
export const MIN_WEIGH_INS = 3;
/** Weigh-ins must span at least this many days for a trend. */
const MIN_WEIGHT_SPAN_DAYS = 10;
const MIN_DAY_KCAL = 800;
const MIN_DAY_MEALS = 2;
const MAX_LOSS_SHARE_PER_WEEK = 0.01;
const MAX_GAIN_KG_PER_WEEK = 0.35;
const MAX_DEFICIT = 1000;
const MAX_SURPLUS = 500;
const FLOOR_KCAL = 1200;
/** Smaller changes than this aren't worth asking about. */
const MIN_CHANGE_KCAL = 100;

const DAY_MS = 86_400_000;
const dayNumber = (date: string): number => Math.round(Date.parse(`${date}T00:00:00Z`) / DAY_MS);
const dateOf = (n: number): string => new Date(n * DAY_MS).toISOString().slice(0, 10);
const r2 = (n: number): number => Math.round(n * 100) / 100;
const to50 = (n: number): number => Math.round(n / 50) * 50;

export type IntakeDay = { date: string; calories: number; meals: number };

export type CalorieReview =
  | {
      status: "ok";
      maintenanceKcal: number;
      avgIntakeKcal: number;
      loggedDays: number;
      weighIns: number;
      trendWeightKg: number;
      /** Fitted weight change per week over the window (negative = losing). */
      actualKgPerWeek: number;
      /** Pace the deadline needs, before the safety cap; null without a weight target. */
      neededKgPerWeek: number | null;
      /** Pace the suggested target aims for. */
      plannedKgPerWeek: number;
      suggestedTarget: number;
      currentTarget: number | null;
      change: number | null;
      /** True when the suggestion differs enough from the current target to offer it. */
      recommend: boolean;
      confidence: "low" | "medium" | "high";
      cappedForSafety: boolean;
      /** When capped: the date the safe pace reaches the target weight. */
      safeDate: string | null;
      targetWeightKg: number | null;
      deadline: string | null;
      summary: string;
    }
  | {
      status: "not_enough_data";
      loggedDays: number;
      weighIns: number;
      summary: string;
    };

export function reviewCalorieTarget(input: {
  today: string;
  intake: IntakeDay[];
  checkins: BodyCheckin[];
  goal: HealthGoal | null;
  currentTarget: number | null;
}): CalorieReview {
  const todayN = dayNumber(input.today);
  const from = todayN - REVIEW_WINDOW_DAYS;

  // Today is still being logged, so it's left out.
  const logged = input.intake.filter((d) => {
    const n = dayNumber(d.date);
    return n >= from && n < todayN && d.meals >= MIN_DAY_MEALS && d.calories >= MIN_DAY_KCAL;
  });
  const weights = input.checkins
    .filter((c) => c.weight_kg !== null && dayNumber(c.localDate) >= from && dayNumber(c.localDate) <= todayN)
    .map((c) => ({ day: dayNumber(c.localDate), value: Number(c.weight_kg) }));
  const span = weights.length ? Math.max(...weights.map((w) => w.day)) - Math.min(...weights.map((w) => w.day)) : 0;
  const slope = weights.length >= MIN_WEIGH_INS && span >= MIN_WEIGHT_SPAN_DAYS ? slopePerDay(weights) : null;

  if (logged.length < MIN_LOGGED_DAYS || slope === null) {
    const needs: string[] = [];
    if (logged.length < MIN_LOGGED_DAYS) needs.push(`${MIN_LOGGED_DAYS - logged.length} more fully logged day${MIN_LOGGED_DAYS - logged.length === 1 ? "" : "s"}`);
    if (slope === null) needs.push(`weigh-ins at least ${MIN_WEIGHT_SPAN_DAYS} days apart (${weights.length} in the last 4 weeks)`);
    return {
      status: "not_enough_data",
      loggedDays: logged.length,
      weighIns: weights.length,
      summary: `Not enough data to work out your maintenance yet: need ${needs.join(" and ")}.`,
    };
  }

  const avgIntake = logged.reduce((s, d) => s + d.calories, 0) / logged.length;
  const maintenance = avgIntake - slope * KCAL_PER_KG;
  const meanDay = weights.reduce((s, w) => s + w.day, 0) / weights.length;
  const meanW = weights.reduce((s, w) => s + w.value, 0) / weights.length;
  const trendWeight = meanW + slope * (todayN - meanDay);

  const targetW = input.goal?.targets.weight_kg ?? null;
  const deadline = input.goal?.deadline ?? null;
  const daysLeft = deadline ? dayNumber(deadline) - todayN : 0;
  let neededPerDay: number | null = null;
  if (targetW !== null && deadline && daysLeft > 0) neededPerDay = (targetW - trendWeight) / daysLeft;

  // Safe pace limits, then the kcal limits on top.
  const maxLossPerDay = (MAX_LOSS_SHARE_PER_WEEK * trendWeight) / 7;
  const maxGainPerDay = MAX_GAIN_KG_PER_WEEK / 7;
  const wanted = (neededPerDay ?? 0) * KCAL_PER_KG;
  let plannedPerDay = Math.max(-maxLossPerDay, Math.min(maxGainPerDay, neededPerDay ?? 0));
  const delta = Math.max(-MAX_DEFICIT, Math.min(MAX_SURPLUS, plannedPerDay * KCAL_PER_KG));
  const raw = maintenance + delta;
  // At a cap, round toward maintenance so rounding never pushes past the safe pace.
  const atCap = Math.abs(delta - wanted) > 1;
  let suggested = Math.max(FLOOR_KCAL, !atCap ? to50(raw) : delta < 0 ? Math.ceil(raw / 50) * 50 : Math.floor(raw / 50) * 50);
  suggested = Math.min(6000, Math.max(800, suggested));
  plannedPerDay = (suggested - maintenance) / KCAL_PER_KG;
  const capped = neededPerDay !== null && Math.abs(plannedPerDay - neededPerDay) * 7 > 0.05;

  let safeDate: string | null = null;
  if (capped && targetW !== null && Math.sign(targetW - trendWeight) === Math.sign(plannedPerDay) && plannedPerDay !== 0) {
    safeDate = dateOf(todayN + Math.ceil((targetW - trendWeight) / plannedPerDay));
  }

  const change = input.currentTarget === null ? null : suggested - input.currentTarget;
  const recommend = change === null || Math.abs(change) >= MIN_CHANGE_KCAL;
  const confidence: "low" | "medium" | "high" =
    logged.length >= 21 && weights.length >= 4 ? "high" : logged.length >= 14 && weights.length >= 3 ? "medium" : "low";

  const actualKgPerWeek = r2(slope * 7);
  const plannedKgPerWeek = r2(plannedPerDay * 7);
  return {
    status: "ok",
    maintenanceKcal: Math.round(maintenance / 10) * 10,
    avgIntakeKcal: Math.round(avgIntake),
    loggedDays: logged.length,
    weighIns: weights.length,
    trendWeightKg: r2(trendWeight),
    actualKgPerWeek,
    neededKgPerWeek: neededPerDay === null ? null : r2(neededPerDay * 7),
    plannedKgPerWeek,
    suggestedTarget: suggested,
    currentTarget: input.currentTarget,
    change,
    recommend,
    confidence,
    cappedForSafety: capped,
    safeDate,
    targetWeightKg: targetW,
    deadline,
    summary: summarize({ maintenance, avgIntake, actualKgPerWeek, plannedKgPerWeek, suggested, currentTarget: input.currentTarget, recommend, capped, safeDate, targetW, deadline }),
  };
}

const kcal = (n: number): string => `${Math.round(n).toLocaleString("en-US")} kcal`;
const kgWeek = (n: number): string => `${n > 0 ? "+" : ""}${n.toFixed(2)} kg/week`;

function summarize(x: {
  maintenance: number;
  avgIntake: number;
  actualKgPerWeek: number;
  plannedKgPerWeek: number;
  suggested: number;
  currentTarget: number | null;
  recommend: boolean;
  capped: boolean;
  safeDate: string | null;
  targetW: number | null;
  deadline: string | null;
}): string {
  const parts = [
    `You've averaged ${kcal(x.avgIntake)} on logged days and your weight moved ${kgWeek(x.actualKgPerWeek)}, so your maintenance is about ${kcal(Math.round(x.maintenance / 10) * 10)}.`,
  ];
  const aim = x.targetW !== null && x.deadline ? `to reach ${x.targetW} kg by ${x.deadline}` : "to hold your weight";
  if (!x.recommend && x.currentTarget !== null) {
    parts.push(`Your target of ${kcal(x.currentTarget)} is right ${aim}.`);
  } else {
    parts.push(`${kcal(x.suggested)} a day (${kgWeek(x.plannedKgPerWeek)}) is the target ${aim}${x.capped ? " at a safe pace" : ""}${x.currentTarget !== null ? `, vs ${kcal(x.currentTarget)} now` : ""}.`);
  }
  if (x.capped) {
    parts.push(x.safeDate ? `The deadline needs a faster pace than is safe; at this pace you'd get there around ${x.safeDate}.` : "The deadline needs a faster pace than is safe.");
  }
  return parts.join(" ");
}

// ---------- loading ----------

/** Reads the last 4 weeks of meals and weigh-ins, the goal and the target, then reviews them. */
export async function loadCalorieReview(userProfileId: string, now = new Date()): Promise<CalorieReview> {
  const profile = await loadHealthProfile(userProfileId);
  const today = localDateKey(now, profile.timezone);
  const from = dateOf(dayNumber(today) - REVIEW_WINDOW_DAYS);
  const [days, checkins, goal] = await Promise.all([
    loadMealDays(userProfileId, from, today),
    getBodyCheckins(userProfileId, from),
    getActiveGoal(userProfileId),
  ]);
  const intake: IntakeDay[] = [...days].map(([date, d]) => ({ date, calories: d.calories, meals: d.sessions.size }));
  return reviewCalorieTarget({ today, intake, checkins, goal, currentTarget: profile.targets.calorieTarget });
}
