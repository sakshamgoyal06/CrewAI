/**
 * Training analysis from Hevy history: per-exercise progression (estimated 1RM trend), stalls,
 * weekly frequency and volume. Pure functions plus the loaders that read Hevy.
 */
import { localDateKey } from "../nutrition/localDate.js";
import {
  fetchHevyExerciseTemplateCatalog,
  fetchHevyRoutinesPage,
  fetchHevyWorkoutsPage,
  hevyApiKeyForUser,
  hevyApiKeyFromEnv,
  type HevyExerciseTemplateBrief,
  type HevyRoutine,
  type HevyWorkout,
  type HevyWorkoutSet,
} from "../pillars/health/workouts/hevy/index.js";

const DAY_MS = 86_400_000;
/** Change in best estimated 1RM, first vs last sessions in the window, that counts as movement. */
const TREND_THRESHOLD = 0.025;
const MIN_SESSIONS_FOR_TREND = 3;
const STALL_MIN_SESSIONS = 4;
const STALL_MIN_SPAN_DAYS = 21;

export type ExerciseTrend = "progressing" | "stalled" | "regressing" | "new";

export type ExerciseProgress = {
  exerciseTemplateId: string | null;
  title: string;
  sessions: number;
  lastDate: string;
  /** Best working set of the latest session, e.g. "80 kg × 6". */
  lastTopSet: string | null;
  /** Best estimated 1RM per session, oldest first (kg). Empty for bodyweight/cardio. */
  e1rmSeries: Array<{ date: string; e1rm: number }>;
  changePct: number | null;
  trend: ExerciseTrend;
  workingSetsPerWeek: number;
};

export type TrainingAnalysis = {
  weeks: number;
  workouts: number;
  workoutsPerWeek: number;
  avgDurationMin: number | null;
  /** Tonnage per ISO-ish week (Mon start), oldest first. */
  weeklyVolumeKg: Array<{ weekStart: string; volumeKg: number; workouts: number }>;
  exercises: ExerciseProgress[];
  progressing: string[];
  stalled: string[];
  regressing: string[];
};

function isWorkingSet(set: HevyWorkoutSet): boolean {
  return (set.type ?? "normal").toLowerCase() !== "warmup";
}

/** Epley estimate; capped at 12 reps where the formula stops meaning much. */
export function estimateOneRepMax(weightKg: number, reps: number): number {
  if (weightKg <= 0 || reps <= 0) return 0;
  if (reps === 1) return weightKg;
  return weightKg * (1 + Math.min(reps, 12) / 30);
}

const round1 = (n: number) => Math.round(n * 10) / 10;

function mondayOf(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  const back = (d.getUTCDay() + 6) % 7;
  return new Date(d.getTime() - back * DAY_MS).toISOString().slice(0, 10);
}

export function analyzeTraining(
  workouts: HevyWorkout[],
  now: Date,
  timezone: string,
  weeks = 8,
): TrainingAnalysis {
  const cutoff = localDateKey(new Date(now.getTime() - weeks * 7 * DAY_MS), timezone);
  const inWindow = workouts
    .filter((w) => w.start_time && !Number.isNaN(new Date(w.start_time).getTime()))
    .map((w) => ({ w, date: localDateKey(new Date(w.start_time!), timezone) }))
    .filter((x) => x.date >= cutoff)
    .sort((a, b) => a.date.localeCompare(b.date));

  const durations: number[] = [];
  const weekly = new Map<string, { volumeKg: number; workouts: number }>();
  type Acc = { id: string | null; title: string; sessions: Array<{ date: string; e1rm: number; top: string | null }>; sets: number };
  const byExercise = new Map<string, Acc>();

  for (const { w, date } of inWindow) {
    if (w.end_time) {
      const min = (new Date(w.end_time).getTime() - new Date(w.start_time!).getTime()) / 60_000;
      if (min > 0 && min < 600) durations.push(min);
    }
    const wk = weekly.get(mondayOf(date)) ?? { volumeKg: 0, workouts: 0 };
    wk.workouts += 1;
    for (const ex of w.exercises ?? []) {
      const title = ex.title?.trim() || "Exercise";
      const key = ex.exercise_template_id || title.toLowerCase();
      const acc = byExercise.get(key) ?? { id: ex.exercise_template_id ?? null, title, sessions: [], sets: 0 };
      let best = 0;
      let top: string | null = null;
      for (const set of ex.sets ?? []) {
        if (!isWorkingSet(set)) continue;
        acc.sets += 1;
        const kg = set.weight_kg ?? 0;
        const reps = set.reps ?? 0;
        if (kg > 0 && reps > 0) wk.volumeKg += kg * reps;
        const e = estimateOneRepMax(kg, reps);
        if (e > best) {
          best = e;
          top = `${round1(kg)} kg × ${reps}`;
        } else if (!top && reps > 0 && kg <= 0) {
          top = `${reps} reps`;
        }
      }
      acc.sessions.push({ date, e1rm: best, top });
      byExercise.set(key, acc);
    }
    weekly.set(mondayOf(date), wk);
  }

  const exercises: ExerciseProgress[] = [...byExercise.values()].map((acc) => {
    const series = acc.sessions.filter((s) => s.e1rm > 0).map((s) => ({ date: s.date, e1rm: round1(s.e1rm) }));
    let trend: ExerciseTrend = "new";
    let changePct: number | null = null;
    if (series.length >= MIN_SESSIONS_FOR_TREND) {
      // Best of the first two vs best of the last two sessions smooths one-off good or bad days.
      const first = Math.max(...series.slice(0, 2).map((s) => s.e1rm));
      const last = Math.max(...series.slice(-2).map((s) => s.e1rm));
      const change = (last - first) / first;
      changePct = round1(change * 100);
      const spanDays =
        (new Date(series[series.length - 1]!.date).getTime() - new Date(series[0]!.date).getTime()) / DAY_MS;
      if (change > TREND_THRESHOLD) trend = "progressing";
      else if (change < -TREND_THRESHOLD) trend = "regressing";
      else if (series.length >= STALL_MIN_SESSIONS && spanDays >= STALL_MIN_SPAN_DAYS) trend = "stalled";
      else trend = "new";
    }
    const lastSession = acc.sessions[acc.sessions.length - 1]!;
    return {
      exerciseTemplateId: acc.id,
      title: acc.title,
      sessions: acc.sessions.length,
      lastDate: lastSession.date,
      lastTopSet: lastSession.top,
      e1rmSeries: series,
      changePct,
      trend,
      workingSetsPerWeek: round1(acc.sets / weeks),
    };
  });
  exercises.sort((a, b) => b.sessions - a.sessions || a.title.localeCompare(b.title));

  return {
    weeks,
    workouts: inWindow.length,
    workoutsPerWeek: round1(inWindow.length / weeks),
    avgDurationMin: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null,
    weeklyVolumeKg: [...weekly.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([weekStart, v]) => ({ weekStart, volumeKg: Math.round(v.volumeKg), workouts: v.workouts })),
    exercises,
    progressing: exercises.filter((e) => e.trend === "progressing").map((e) => e.title),
    stalled: exercises.filter((e) => e.trend === "stalled").map((e) => e.title),
    regressing: exercises.filter((e) => e.trend === "regressing").map((e) => e.title),
  };
}

// ---------- Hevy reads ----------

export async function hevyKey(userProfileId: string): Promise<string | undefined> {
  return (await hevyApiKeyForUser(userProfileId)) ?? hevyApiKeyFromEnv();
}

/** Workouts newest first, back to `weeks` ago (at most 15 pages of 10). */
export async function loadWorkoutHistory(
  apiKey: string,
  now: Date,
  weeks: number,
): Promise<{ ok: true; workouts: HevyWorkout[] } | { ok: false; error: string }> {
  const cutoff = now.getTime() - (weeks * 7 + 1) * DAY_MS;
  const out: HevyWorkout[] = [];
  for (let page = 1; page <= 15; page++) {
    const r = await fetchHevyWorkoutsPage(apiKey, page, 10);
    if (!r.ok) return page === 1 ? { ok: false, error: r.error } : { ok: true, workouts: out };
    const batch = r.data.workouts ?? [];
    out.push(...batch);
    const oldest = batch[batch.length - 1]?.start_time;
    if (!batch.length || page >= (r.data.page_count ?? page)) break;
    if (oldest && new Date(oldest).getTime() < cutoff) break;
  }
  return { ok: true, workouts: out };
}

export async function loadRoutines(
  apiKey: string,
): Promise<{ ok: true; routines: HevyRoutine[] } | { ok: false; error: string }> {
  const out: HevyRoutine[] = [];
  for (let page = 1; page <= 10; page++) {
    const r = await fetchHevyRoutinesPage(apiKey, page, 10);
    if (!r.ok) return page === 1 ? { ok: false, error: r.error } : { ok: true, routines: out };
    const batch = r.data.routines ?? [];
    out.push(...batch);
    if (!batch.length || page >= (r.data.page_count ?? page)) break;
  }
  return { ok: true, routines: out };
}

/** Routine as the model sees it: exercises with their template ids and a one-line set scheme. */
export function routineForModel(r: HevyRoutine): Record<string, unknown> {
  return {
    id: r.id,
    title: r.title,
    notes: r.notes ?? null,
    exercises: (r.exercises ?? []).map((e) => ({
      exerciseTemplateId: e.exercise_template_id,
      title: e.title,
      restSeconds: e.rest_seconds ?? null,
      sets: describeSets(e.sets ?? []),
      notes: e.notes ?? null,
    })),
  };
}

export function describeSets(sets: Array<{ type?: string; weight_kg?: number | null; reps?: number | null; rep_range?: { start?: number | null; end?: number | null } | null; duration_seconds?: number | null }>): string {
  const working = sets.filter((s) => (s.type ?? "normal") !== "warmup");
  const warm = sets.length - working.length;
  if (!working.length) return warm ? `${warm} warm-up` : "no sets";
  const one = (s: (typeof working)[number]) => {
    const reps =
      s.rep_range?.start && s.rep_range?.end ? `${s.rep_range.start}–${s.rep_range.end}` : s.reps ? String(s.reps) : s.duration_seconds ? `${s.duration_seconds}s` : "?";
    return s.weight_kg ? `${reps} @ ${round1(s.weight_kg)} kg` : reps;
  };
  const labels = working.map(one);
  const same = labels.every((l) => l === labels[0]);
  const body = same ? `${working.length} × ${labels[0]}` : labels.join(", ");
  return warm ? `${warm} warm-up + ${body}` : body;
}

// ---------- exercise templates ----------

const CATALOG_TTL_MS = 24 * 3_600_000;
let catalogCache: { key: string; at: number; templates: HevyExerciseTemplateBrief[] } | null = null;

export async function exerciseCatalog(
  apiKey: string,
): Promise<{ ok: true; templates: HevyExerciseTemplateBrief[] } | { ok: false; error: string }> {
  if (catalogCache && catalogCache.key === apiKey && Date.now() - catalogCache.at < CATALOG_TTL_MS) {
    return { ok: true, templates: catalogCache.templates };
  }
  const r = await fetchHevyExerciseTemplateCatalog(apiKey);
  if (!r.ok) return r;
  catalogCache = { key: apiKey, at: Date.now(), templates: r.templates };
  return r;
}

/** Templates ranked by word overlap with the query; exact title match first. */
export function searchTemplates(
  query: string,
  templates: HevyExerciseTemplateBrief[],
  limit = 8,
): HevyExerciseTemplateBrief[] {
  const q = query.toLowerCase().trim();
  const words = q.split(/[^a-z0-9]+/).filter((w) => w.length > 1);
  if (!words.length) return [];
  return templates
    .map((t) => {
      const title = t.title.toLowerCase();
      let score = title === q ? 100 : 0;
      for (const w of words) if (title.includes(w)) score += 2;
      if (title.startsWith(words[0]!)) score += 1;
      return { t, score, len: title.length };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.len - b.len)
    .slice(0, limit)
    .map((x) => x.t);
}

/**
 * Short post-workout note from the analysis: new bests and stalled lifts in that day's session.
 * Null when there's nothing to say beyond "it's logged".
 */
export function workoutReview(
  workout: { title: string; durationMin: number | null; exerciseCount: number },
  date: string,
  analysis: TrainingAnalysis,
): string | null {
  const todays = analysis.exercises.filter((e) => e.lastDate === date);
  const bests = todays.filter((e) => {
    const s = e.e1rmSeries;
    const last = s[s.length - 1];
    if (!last || last.date !== date || s.length < 2) return false;
    return last.e1rm > Math.max(...s.slice(0, -1).map((x) => x.e1rm));
  });
  const stalled = todays.filter((e) => e.trend === "stalled" || e.trend === "regressing");
  if (!bests.length && !stalled.length) return null;
  const parts = [
    `${workout.title} is in Hevy${workout.durationMin ? ` (${workout.durationMin} min)` : ""}.`,
    bests.length ? `New best: ${bests.slice(0, 3).map((e) => `${e.title} ${e.lastTopSet}`).join(", ")}.` : null,
    stalled.length
      ? `Not moving for ${stalled.length === 1 ? "a while" : "weeks"}: ${stalled.slice(0, 3).map((e) => e.title).join(", ")}. Want me to suggest a swap or a rep change?`
      : null,
  ];
  return parts.filter(Boolean).join(" ");
}
