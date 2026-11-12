/**
 * Outcome goal progress: where each body metric is vs. its target and deadline, from weekly
 * check-ins. Pure, so the tracker and the coach read the same numbers.
 */
import { dateOf, dayNumber } from "../util/time.js";

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
  /** The next near target on the straight line from start to goal (12 Nov plan, item 3). */
  checkpoint?: Checkpoint | null;
};

/**
 * A near target, every CHECKPOINT_DAYS from the goal's start, on the straight line from the start
 * value to the target at the deadline. A 12-week goal feels far; "77.5 kg by 2 Dec" doesn't.
 */
export type Checkpoint = {
  /** 1-based, and how many the goal has (the last one is the deadline). */
  index: number;
  total: number;
  date: string;
  value: number;
  /** 0–1 from the previous checkpoint (or the start) to this one, from the latest reading. */
  progress: number;
  /** The latest reading already passes this checkpoint. */
  reached: boolean;
  /** The checkpoint before this one and whether the latest reading passes it, for "Checkpoint 1 hit". */
  previous: { index: number; date: string; value: number; reached: boolean } | null;
};

export const CHECKPOINT_DAYS = 28;

/** The checkpoint to show today: the first one dated today or later. Pure. */
export function nextCheckpoint(input: {
  start: number | null;
  latest: number | null;
  target: number;
  startDate: string;
  deadline: string;
  today: string;
}): Checkpoint | null {
  const { start, latest, target } = input;
  if (start === null || start === target) return null;
  const s = dayNumber(input.startDate);
  const e = dayNumber(input.deadline);
  if (e <= s) return null;
  const total = Math.max(1, Math.ceil((e - s) / CHECKPOINT_DAYS));
  const at = (i: number) => {
    const day = Math.min(e, s + i * CHECKPOINT_DAYS);
    return { day, value: round(start + ((target - start) * (day - s)) / (e - s), 1) };
  };
  const t = dayNumber(input.today);
  let index = 1;
  while (index < total && at(index).day < t) index += 1;
  const cp = at(index);
  const from = index === 1 ? start : at(index - 1).value;
  const dir = Math.sign(target - start);
  const passes = (v: number) => latest !== null && (dir > 0 ? latest >= v : latest <= v);
  const span = cp.value - from;
  const progress = latest === null || span === 0 ? 0 : Math.max(0, Math.min(1, (latest - from) / span));
  const prev = index > 1 ? at(index - 1) : null;
  return {
    index,
    total,
    date: dateFromDayNumber(cp.day),
    value: cp.value,
    progress: round(progress, 3),
    reached: passes(cp.value),
    previous: prev ? { index: index - 1, date: dateFromDayNumber(prev.day), value: prev.value, reached: passes(prev.value) } : null,
  };
}

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

const TREND_WINDOW_DAYS = 28;
/** Within this share of the required pace counts as on pace. */
const PACE_TOLERANCE = 0.15;
export const CHECKIN_INTERVAL_DAYS = 7;
/** On the chosen weigh-in day, a reading at least this many days old asks for a new one. */
export const WEIGH_IN_DAY_MIN_GAP = 3;

/**
 * Whether this week's weigh-in is due. Without a chosen day: 7 days after the last one. With a
 * chosen weekday: on that day (unless they weighed in within the last few days), and on any day
 * once the last reading is more than a week old, so a missed weigh-in day still gets caught up.
 */
export function weighInDue(lastCheckinDate: string | null, today: string, weighInDay?: number | null): boolean {
  if (lastCheckinDate === null) return true;
  const gap = dayNumber(today) - dayNumber(lastCheckinDate);
  if (weighInDay == null) return gap >= CHECKIN_INTERVAL_DAYS;
  if (gap > CHECKIN_INTERVAL_DAYS) return true;
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  return weekday === weighInDay && gap >= WEIGH_IN_DAY_MIN_GAP;
}

const dateFromDayNumber = dateOf;

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
    checkpoint: nextCheckpoint({ start, latest, target, startDate: goal.startDate, deadline: goal.deadline, today }),
  };
}

export function computeGoalProgress(
  goal: HealthGoal,
  checkins: BodyCheckin[],
  today: string,
  weighInDay?: number | null,
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
    checkinDue: weighInDue(lastCheckinDate, today, weighInDay),
  };
}
