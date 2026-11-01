/**
 * Outcome goal progress: where each body metric is vs. its target and deadline, from weekly
 * check-ins. Pure, so the tracker and the coach read the same numbers.
 */

export type BodyMetric = "weight_kg" | "body_fat_pct" | "muscle_mass_kg";

export type BodyCheckin = {
  localDate: string;
  weight_kg: number | null;
  body_fat_pct: number | null;
  muscle_mass_kg: number | null;
};

export type HealthGoal = {
  id: string;
  startDate: string;
  deadline: string;
  targets: Partial<Record<BodyMetric, number>>;
};

export type MetricPace = "ahead" | "on_pace" | "behind" | "not_enough_data" | "reached";

export type MetricProgress = {
  metric: BodyMetric;
  label: string;
  unit: string;
  start: number | null;
  latest: number | null;
  latestDate: string | null;
  target: number;
  /** 0–1 share of the start → target distance covered. */
  progress: number | null;
  /** Change per week needed from latest to hit the target by the deadline. */
  requiredPerWeek: number | null;
  /** Fitted change per week over the last 4 weeks of check-ins. */
  actualPerWeek: number | null;
  pace: MetricPace;
  /** Date the current trend reaches the target, if it is heading there. */
  projectedDate: string | null;
};

export type GoalProgress = {
  goal: HealthGoal;
  weeksLeft: number;
  daysLeft: number;
  metrics: MetricProgress[];
  checkinDue: boolean;
  lastCheckinDate: string | null;
};

const META: Record<BodyMetric, { label: string; unit: string }> = {
  weight_kg: { label: "Weight", unit: "kg" },
  body_fat_pct: { label: "Body fat", unit: "%" },
  muscle_mass_kg: { label: "Muscle mass", unit: "kg" },
};

const DAY_MS = 86_400_000;
const TREND_WINDOW_DAYS = 28;
/** Within this share of the required pace counts as on pace. */
const PACE_TOLERANCE = 0.15;
export const CHECKIN_INTERVAL_DAYS = 7;

function dayNumber(date: string): number {
  return Math.round(Date.parse(`${date}T00:00:00Z`) / DAY_MS);
}

function dateFromDayNumber(n: number): string {
  return new Date(n * DAY_MS).toISOString().slice(0, 10);
}

function round(n: number, dp = 2): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

/** Least-squares slope in units per day; null with fewer than 2 distinct days. */
export function slopePerDay(points: Array<{ day: number; value: number }>): number | null {
  if (points.length < 2) {
    return null;
  }
  const n = points.length;
  const mx = points.reduce((s, p) => s + p.day, 0) / n;
  const my = points.reduce((s, p) => s + p.value, 0) / n;
  let num = 0;
  let den = 0;
  for (const p of points) {
    num += (p.day - mx) * (p.value - my);
    den += (p.day - mx) ** 2;
  }
  return den === 0 ? null : num / den;
}

function metricProgress(
  metric: BodyMetric,
  target: number,
  goal: HealthGoal,
  checkins: BodyCheckin[],
  today: string,
): MetricProgress {
  const series = checkins
    .filter((c) => c[metric] !== null && c[metric] !== undefined)
    .map((c) => ({ date: c.localDate, value: Number(c[metric]) }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const startPoint =
    [...series].reverse().find((p) => p.date <= goal.startDate) ??
    series.find((p) => p.date >= goal.startDate) ??
    null;
  const latestPoint = series.at(-1) ?? null;
  const start = startPoint?.value ?? null;
  const latest = latestPoint?.value ?? null;

  const todayN = dayNumber(today);
  const daysLeft = Math.max(0, dayNumber(goal.deadline) - todayN);

  const recent = series
    .filter((p) => dayNumber(p.date) >= todayN - TREND_WINDOW_DAYS)
    .map((p) => ({ day: dayNumber(p.date), value: p.value }));
  const perDay = slopePerDay(recent);
  const actualPerWeek = perDay === null ? null : round(perDay * 7);

  const remaining = latest === null ? null : target - latest;
  const requiredPerWeek =
    remaining === null ? null : daysLeft === 0 ? null : round((remaining / daysLeft) * 7);

  let progress: number | null = null;
  if (start !== null && latest !== null) {
    const total = target - start;
    progress = total === 0 ? 1 : Math.max(0, Math.min(1, (latest - start) / total));
  }

  const direction = start === null ? Math.sign(remaining ?? 0) : Math.sign(target - start);
  const reached =
    latest !== null &&
    (direction === 0 || (direction > 0 ? latest >= target : latest <= target));

  let pace: MetricPace;
  let projectedDate: string | null = null;
  if (reached) {
    pace = "reached";
  } else if (perDay === null || requiredPerWeek === null || actualPerWeek === null) {
    pace = "not_enough_data";
  } else {
    // Positive when moving toward the target.
    const towardActual = actualPerWeek * Math.sign(requiredPerWeek);
    const towardRequired = Math.abs(requiredPerWeek);
    if (towardActual >= towardRequired * (1 + PACE_TOLERANCE)) {
      pace = "ahead";
    } else if (towardActual >= towardRequired * (1 - PACE_TOLERANCE)) {
      pace = "on_pace";
    } else {
      pace = "behind";
    }
    if (towardActual > 0 && remaining !== null && latestPoint) {
      const daysToGo = Math.abs(remaining) / Math.abs(perDay);
      projectedDate = dateFromDayNumber(dayNumber(latestPoint.date) + Math.ceil(daysToGo));
    }
  }

  return {
    metric,
    label: META[metric].label,
    unit: META[metric].unit,
    start,
    latest,
    latestDate: latestPoint?.date ?? null,
    target,
    progress: progress === null ? null : round(progress, 3),
    requiredPerWeek,
    actualPerWeek,
    pace,
    projectedDate,
  };
}

export function computeGoalProgress(
  goal: HealthGoal,
  checkins: BodyCheckin[],
  today: string,
): GoalProgress {
  const metrics: MetricProgress[] = [];
  for (const metric of ["weight_kg", "body_fat_pct", "muscle_mass_kg"] as const) {
    const target = goal.targets[metric];
    if (target !== undefined && target !== null && Number.isFinite(target)) {
      metrics.push(metricProgress(metric, target, goal, checkins, today));
    }
  }
  const lastCheckinDate =
    checkins.map((c) => c.localDate).sort().at(-1) ?? null;
  const daysLeft = Math.max(0, dayNumber(goal.deadline) - dayNumber(today));
  return {
    goal,
    daysLeft,
    weeksLeft: round(daysLeft / 7, 1),
    metrics,
    lastCheckinDate,
    checkinDue:
      lastCheckinDate === null ||
      dayNumber(today) - dayNumber(lastCheckinDate) >= CHECKIN_INTERVAL_DAYS,
  };
}
