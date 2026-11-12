/**
 * The weekly review screen: the last 7 days against the targets and the goal, compared with the
 * week before, and the one thing to fix next week. Pure summary over the tracker's history.
 */
import { MIN_LIFTING_DAYS } from "./activities.js";
import { loadFocusContext, NO_FOCUS_CONTEXT, pickFocus, type FocusContext } from "./focus.js";
import type { GoalProgress, MetricProgress } from "./goalProgress.js";
import { buildHealthHistory, type HistoryDay } from "./history.js";
import type { CheckId, HealthTargets } from "./northStar.js";
import { WEEKLY_ON_TRACK_GOAL } from "./northStar.js";
import { buildHealthSnapshot } from "./snapshot.js";
import { adherenceLine, loadAdherence } from "./dietPlan/adherence.js";

export type WeekStats = {
  from: string;
  to: string;
  onTrackDays: number;
  daysLogged: number;
  avgCalories: number | null;
  avgProteinG: number | null;
  avgSteps: number;
  workouts: number;
  plannedWorkouts: number;
  /** Lifting sessions (Hevy, or trained but not logged). */
  liftingSessions: number;
  /** Non-Hevy activities counted toward burn. */
  activities: number;
  activityKcal: number;
  topActivity: string | null;
};

export type WeeklyReview = {
  week: WeekStats;
  previous: WeekStats | null;
  targets: Pick<HealthTargets, "calorieTarget" | "proteinTarget" | "stepTarget">;
  onTrackGoal: number;
  days: Array<{ date: string; weekday: number; onTrack: boolean; score: number; unlogged: boolean }>;
  bestDay: { date: string; score: number } | null;
  mostMissed: { id: CheckId; label: string; missedDays: number } | null;
  goal: {
    deadline: string;
    weeksLeft: number;
    metrics: Array<Pick<MetricProgress, "label" | "unit" | "latest" | "target" | "requiredPerWeek" | "actualPerWeek" | "pace" | "projectedDate" | "progress" | "checkpoint">>;
    checkinDue: boolean;
  } | null;
  headline: string;
  focus: string;
  /** Days logged this week and next week's logging target (one more day, up to 6); null when every day was logged in full. */
  loggingLine: string | null;
  /** Swims, runs, sports this week, and what they meant for the strength plan; null when none. */
  activityLine: string | null;
  /** How the meal plan went: meals eaten from it, and the meal that slips most; null without a plan. */
  mealPlanLine?: string | null;
  /** What the scale is and isn't saying this week (early water drop, normal swings); null when it says nothing new. */
  scaleLine?: string | null;
};

/** Days kept out of 7 at which a flat scale is noise, not a plan problem. */
const NOISE_KEPT_DAYS = 4;

/**
 * The scale note (12 Nov plan, item 4). Weeks 1–2: a fast early drop is mostly water and gut
 * content, so the slower weeks after it aren't a stall. Later, a flat or rising week while most
 * days were kept is day-to-day swing, judged on the 4-week trend. Weight behind pace on few kept
 * days is a real gap and gets no excuse here. Pure.
 */
export function scaleLine(input: {
  weight: Pick<MetricProgress, "start" | "latest" | "target" | "actualPerWeek" | "pace"> | null;
  goalStartDate: string | null;
  weekEnd: string;
  keptDays: number;
}): string | null {
  const w = input.weight;
  if (!w || w.latest === null || w.start === null || !input.goalStartDate || w.pace === "reached") return null;
  const losing = w.target < w.start;
  const weeksIn = Math.floor((Date.parse(`${input.weekEnd}T00:00:00Z`) - Date.parse(`${input.goalStartDate}T00:00:00Z`)) / (7 * 86_400_000)) + 1;
  const drop = w.start - w.latest;
  if (losing && weeksIn <= 2 && drop >= w.start * 0.01) {
    return "Most of the early drop is water and food in the gut, not fat. Expect the scale to slow from week 3. That's normal, not a stall, so keep the same days going.";
  }
  const stalled = w.actualPerWeek === null || (losing ? w.actualPerWeek >= -0.1 : w.actualPerWeek <= 0.05);
  if (weeksIn >= 2 && stalled && input.keptDays >= NOISE_KEPT_DAYS) {
    return `Weight can swing 0.5 to 1.5 kg day to day with salt, carbs, water and training. With ${input.keptDays} days kept, the change is still happening under that noise. Judge it on the 4-week trend, not one weigh-in.`;
  }
  return null;
}

const avg = (xs: number[]): number | null => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

export function weekStats(days: HistoryDay[], trainingDays: number[]): WeekStats {
  const logged = days.filter((d) => d.meals.length > 0);
  const c = avg(logged.map((d) => d.calories));
  const p = avg(logged.map((d) => d.proteinG));
  return {
    from: days[0]?.date ?? "",
    to: days[days.length - 1]?.date ?? "",
    onTrackDays: days.filter((d) => d.onTrack).length,
    daysLogged: logged.length,
    avgCalories: c === null ? null : Math.round(c),
    avgProteinG: p === null ? null : Math.round(p),
    avgSteps: Math.round(avg(days.map((d) => d.steps)) ?? 0),
    workouts: days.reduce((s, d) => s + d.workouts.length + (d.trainedUnlogged && !d.workouts.length ? 1 : 0) + (d.sportCounted ? 1 : 0), 0),
    plannedWorkouts: days.filter((d) => trainingDays.includes(d.weekday)).length,
    ...activityStats(days),
  };
}

function activityStats(days: HistoryDay[]): Pick<WeekStats, "liftingSessions" | "activities" | "activityKcal" | "topActivity"> {
  const acts = days.flatMap((d) => (d.activities ?? []).filter((a) => a.counted));
  const byLabel = new Map<string, number>();
  for (const a of acts) byLabel.set(a.label, (byLabel.get(a.label) ?? 0) + a.kcal);
  const top = [...byLabel.entries()].sort((a, b) => b[1] - a[1])[0];
  return {
    liftingSessions: days.reduce((s, d) => s + (d.workouts.length || d.trainedUnlogged ? 1 : 0), 0),
    activities: acts.length,
    activityKcal: acts.reduce((s, a) => s + a.kcal, 0),
    topActivity: top ? top[0] : null,
  };
}

export function activityLine(stats: WeekStats, days: HistoryDay[], trainingDays: number[]): string | null {
  if (!stats.activities) return null;
  const parts = [`${stats.activities} activit${stats.activities === 1 ? "y" : "ies"} outside the gym, about ${stats.activityKcal.toLocaleString("en-US")} kcal${stats.topActivity ? `, mostly ${stats.topActivity.toLowerCase()}` : ""}.`];
  const stoodIn = days.filter((d) => d.sportCounted).length;
  const need = Math.min(MIN_LIFTING_DAYS, trainingDays.length);
  if (stoodIn) parts.push(`${stoodIn} counted as training day${stoodIn === 1 ? "" : "s"}.`);
  if (stoodIn && need && stats.liftingSessions < need) {
    parts.push(`That left ${stats.liftingSessions} strength session${stats.liftingSessions === 1 ? "" : "s"} against the ${need} your plan needs, so keep enough training days for lifting.`);
  }
  return parts.join(" ");
}

const FOCUS: Record<CheckId, string> = {
  meals_logged: "Log every meal, even the messy ones. A photo is enough. The plan only adjusts on what it can see.",
  calories: "Land near your calorie target. Plan the evening meal first, since that's where most days go over.",
  protein: "Hit protein: add one protein-heavy item that fits your diet (dal, paneer, curd, soya, or a shake) to two meals a day.",
  macros: "Keep carbs and fat near target: the meal plan's portions do it, so eat those and go easy on oil and fried sides.",
  steps: "Get the steps in: one 20 to 30 minute walk after lunch or dinner covers most of the gap.",
  workout: "Show up on your training days, even for a short session. Logging it in Hevy counts.",
  routine: "Stick to the routine you set: each reminder is the cue, and a short session still counts when you log it.",
};

export function summarizeWeek(
  days: HistoryDay[],
  targets: HealthTargets,
  goal: GoalProgress | null,
  onTrackGoal = WEEKLY_ON_TRACK_GOAL,
  focusCtx: FocusContext = NO_FOCUS_CONTEXT,
): WeeklyReview {
  const week = days.slice(-7);
  const prev = days.length >= 14 ? days.slice(-14, -7) : null;
  const stats = weekStats(week, targets.trainingDays);

  const missed = new Map<CheckId, { label: string; count: number }>();
  for (const d of week) {
    // A partly logged day's food misses are a logging gap (northStar.ts), counted once.
    const ids = new Map<CheckId, string>();
    for (const c of d.checks) {
      if (c.met) continue;
      if (d.partial && ["calories", "protein", "macros"].includes(c.id)) ids.set("meals_logged", "Meals logged");
      else ids.set(c.id, c.label);
    }
    for (const [id, label] of ids) {
      const m = missed.get(id);
      missed.set(id, { label, count: (m?.count ?? 0) + 1 });
    }
  }
  let mostMissed: WeeklyReview["mostMissed"] = null;
  for (const [id, v] of missed) if (!mostMissed || v.count > mostMissed.missedDays) mostMissed = { id, label: v.label, missedDays: v.count };

  const best = week.reduce<HistoryDay | null>((b, d) => (!b || d.score > b.score ? d : b), null);
  const weight = goal?.metrics.find((m) => m.metric === "weight_kg") ?? goal?.metrics[0] ?? null;

  let headline: string;
  if (stats.daysLogged === 0) headline = "Nothing logged this week, so there's nothing to judge yet. Start with today.";
  else if (stats.onTrackDays >= onTrackGoal) headline = `${stats.onTrackDays} of 7 days on track. That's the week that gets you there.`;
  else if (prev && stats.onTrackDays > weekStats(prev, targets.trainingDays).onTrackDays) headline = `${stats.onTrackDays} of 7 days on track, up from last week. Keep the direction.`;
  else headline = `${stats.onTrackDays} of 7 days on track. The goal needs ${onTrackGoal}.`;
  const unlogged = week.filter((d) => d.unlogged).length;
  if (stats.daysLogged > 0 && unlogged) headline += ` ${unlogged === 1 ? "1 day wasn't" : `${unlogged} days weren't`} logged, so ${unlogged === 1 ? "it isn't" : "they aren't"} counted as missed. Fill ${unlogged === 1 ? "it" : "them"} in from Today's day strip or in chat.`;
  if (weight?.pace === "behind") headline += ` ${weight.label} is behind the pace the deadline needs.`;
  else if (weight?.pace === "ahead" || weight?.pace === "on_pace") headline += ` ${weight.label} is on pace.`;
  else if (weight?.pace === "reached") headline += ` ${weight.label} goal reached.`;

  // The shared ranking (focus.ts): unlogged days aren't misses, a protein gap the plan made isn't
  // theirs, and what moves the goal counts more. Nothing missed twice → no focus to push.
  const picked = pickFocus(week, focusCtx);
  const focus = picked
    ? `${picked.pattern ? `${picked.label} missed on ${picked.missedDays} of ${picked.judgedDays} logged days, so it's the plan to change, not effort. ` : ""}${FOCUS[picked.id as CheckId] ?? ""}`.trim()
    : focusCtx.proteinPlanShort
      ? "Your meal plan can't reach your protein target with your food rules. Choose what to do about it on the Meals tab."
      : "Repeat this week. Consistency is the whole plan.";

  return {
    week: stats,
    previous: prev ? weekStats(prev, targets.trainingDays) : null,
    targets: { calorieTarget: targets.calorieTarget, proteinTarget: targets.proteinTarget, stepTarget: targets.stepTarget },
    onTrackGoal,
    days: week.map((d) => ({ date: d.date, weekday: d.weekday, onTrack: d.onTrack, score: d.score, unlogged: !!d.unlogged })),
    bestDay: best && best.score > 0 ? { date: best.date, score: best.score } : null,
    mostMissed,
    goal: goal
      ? {
          deadline: goal.goal.deadline,
          weeksLeft: goal.weeksLeft,
          checkinDue: goal.checkinDue,
          metrics: goal.metrics.map((m) => ({
            label: m.label,
            unit: m.unit,
            latest: m.latest,
            target: m.target,
            requiredPerWeek: m.requiredPerWeek,
            actualPerWeek: m.actualPerWeek,
            pace: m.pace,
            projectedDate: m.projectedDate,
            progress: m.progress,
            checkpoint: m.checkpoint ?? null,
          })),
        }
      : null,
    headline,
    focus,
    loggingLine: loggingLine(week),
    activityLine: activityLine(stats, week, targets.trainingDays),
    scaleLine: scaleLine({
      weight: goal?.metrics.find((m) => m.metric === "weight_kg") ?? null,
      goalStartDate: goal?.goal.startDate ?? null,
      weekEnd: stats.to,
      keptDays: stats.onTrackDays,
    }),
  };
}

/** The logging target rises a day each week until it reaches this. */
export const LOGGING_TARGET_MAX = 6;

/**
 * Logging as its own habit: how many days were logged this week, and next week's target, one day
 * more than this week (so it's always within reach), up to 6. Pure.
 */
export function loggingLine(week: Array<Pick<HistoryDay, "unlogged" | "partial">>): string | null {
  const logged = week.filter((d) => !d.unlogged).length;
  const full = week.filter((d) => !d.unlogged && !d.partial).length;
  if (full === week.length) return null;
  const part = logged > full ? ` (${logged - full} only partly)` : "";
  if (logged >= LOGGING_TARGET_MAX) return `Logged ${logged} of ${week.length} days${part}. Keep logging every day you can; that's what lets the plan adjust.`;
  return `Logged ${logged} of ${week.length} days${part}. Next week, aim to log ${Math.max(1, logged + 1)} days, even roughly.`;
}

export async function loadWeeklyReview(userProfileId: string, now = new Date()): Promise<WeeklyReview> {
  const [history, snapshot] = await Promise.all([
    buildHealthHistory(userProfileId, { days: 14, now }),
    buildHealthSnapshot(userProfileId, now),
  ]);
  const adherence = await loadAdherence(userProfileId, snapshot.today.date).catch(() => null);
  const ctx = await loadFocusContext(userProfileId, snapshot.timezone, now, snapshot.goal).catch(() => NO_FOCUS_CONTEXT);
  return { ...summarizeWeek(history.days, history.targets, snapshot.goal, undefined, ctx), mealPlanLine: adherence ? adherenceLine(adherence) : null };
}
