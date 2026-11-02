/**
 * The weekly review screen: the last 7 days against the targets and the goal, compared with the
 * week before, and the one thing to fix next week. Pure summary over the tracker's history.
 */
import type { GoalProgress, MetricProgress } from "./goalProgress.js";
import { buildHealthHistory, type HistoryDay } from "./history.js";
import type { CheckId, HealthTargets } from "./northStar.js";
import { WEEKLY_ON_TRACK_GOAL } from "./northStar.js";
import { buildHealthSnapshot } from "./snapshot.js";

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
};

export type WeeklyReview = {
  week: WeekStats;
  previous: WeekStats | null;
  targets: Pick<HealthTargets, "calorieTarget" | "proteinTarget" | "stepTarget">;
  onTrackGoal: number;
  days: Array<{ date: string; weekday: number; onTrack: boolean; score: number }>;
  bestDay: { date: string; score: number } | null;
  mostMissed: { id: CheckId; label: string; missedDays: number } | null;
  goal: {
    deadline: string;
    weeksLeft: number;
    metrics: Array<Pick<MetricProgress, "label" | "unit" | "latest" | "target" | "requiredPerWeek" | "actualPerWeek" | "pace" | "projectedDate" | "progress">>;
    checkinDue: boolean;
  } | null;
  headline: string;
  focus: string;
};

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
    workouts: days.reduce((s, d) => s + d.workouts.length + (d.trainedUnlogged && !d.workouts.length ? 1 : 0), 0),
    plannedWorkouts: days.filter((d) => trainingDays.includes(d.weekday)).length,
  };
}

const FOCUS: Record<CheckId, string> = {
  meals_logged: "Log every meal, even the messy ones. A photo is enough. The plan only adjusts on what it can see.",
  calories: "Land near your calorie target. Plan the evening meal first, since that's where most days go over.",
  protein: "Hit protein: add one protein-heavy item (paneer, eggs, dal, curd, chicken or a shake) to two meals a day.",
  steps: "Get the steps in: one 20 to 30 minute walk after lunch or dinner covers most of the gap.",
  workout: "Show up on your training days, even for a short session. Logging it in Hevy counts.",
};

export function summarizeWeek(
  days: HistoryDay[],
  targets: HealthTargets,
  goal: GoalProgress | null,
  onTrackGoal = WEEKLY_ON_TRACK_GOAL,
): WeeklyReview {
  const week = days.slice(-7);
  const prev = days.length >= 14 ? days.slice(-14, -7) : null;
  const stats = weekStats(week, targets.trainingDays);

  const missed = new Map<CheckId, { label: string; count: number }>();
  for (const d of week) {
    for (const c of d.checks) {
      if (c.met) continue;
      const m = missed.get(c.id);
      missed.set(c.id, { label: c.label, count: (m?.count ?? 0) + 1 });
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
  if (weight?.pace === "behind") headline += ` ${weight.label} is behind the pace the deadline needs.`;
  else if (weight?.pace === "ahead" || weight?.pace === "on_pace") headline += ` ${weight.label} is on pace.`;
  else if (weight?.pace === "reached") headline += ` ${weight.label} goal reached.`;

  const focus = mostMissed && mostMissed.missedDays >= 2 ? FOCUS[mostMissed.id] : "Repeat this week. Consistency is the whole plan.";

  return {
    week: stats,
    previous: prev ? weekStats(prev, targets.trainingDays) : null,
    targets: { calorieTarget: targets.calorieTarget, proteinTarget: targets.proteinTarget, stepTarget: targets.stepTarget },
    onTrackGoal,
    days: week.map((d) => ({ date: d.date, weekday: d.weekday, onTrack: d.onTrack, score: d.score })),
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
          })),
        }
      : null,
    headline,
    focus,
  };
}

export async function loadWeeklyReview(userProfileId: string, now = new Date()): Promise<WeeklyReview> {
  const [history, snapshot] = await Promise.all([
    buildHealthHistory(userProfileId, { days: 14, now }),
    buildHealthSnapshot(userProfileId, now),
  ]);
  return summarizeWeek(history.days, history.targets, snapshot.goal);
}
