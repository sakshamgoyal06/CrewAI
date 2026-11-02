/**
 * Storage and actions for activities outside Hevy (`health_activities`): drafts from chat or the
 * tracker's quick add, saving, deleting, Health Connect sessions, and the training-day follow-up.
 * The rules themselves are in `activities.ts`.
 */
import { randomUUID } from "node:crypto";

import { z } from "zod";

import { logger } from "../logger.js";
import { localDateKey } from "../nutrition/localDate.js";
import { supabase } from "../tools/clients.js";
import {
  ACTIVITY_CATALOG,
  INTENSITIES,
  catalogEntry,
  estimateActivityKcal,
  findHealthConnectMatch,
  healthConnectActivityKey,
  liftingNote,
  matchActivity,
  trainingActivity,
  typicalTrainingBurn,
  type Activity,
  type ActivitySource,
  type Intensity,
  type KcalSource,
  type TimedWorkout,
} from "./activities.js";
import type { ActionContext } from "./actions.js";
import { zonedInstant } from "./gymSlot.js";
import { hevyHistoryCached } from "./hevyHistory.js";
import { loadHealthProfile, weekdayOfDate } from "./snapshot.js";
import { getWorkoutChecks, postCoachMessage, saveWorkoutCheckAnswer } from "./workoutCheckStore.js";

const DAY_MS = 86_400_000;
/** Used for burn estimates until a weigh-in exists. */
export const FALLBACK_WEIGHT_KG = 75;
const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

type Row = Record<string, unknown>;

export function rowToActivity(r: Row): Activity {
  const intensity = INTENSITIES.includes(r.intensity as Intensity) ? (r.intensity as Intensity) : "moderate";
  return {
    id: String(r.id),
    localDate: String(r.local_date),
    startTime: r.start_time ? new Date(String(r.start_time)).toISOString() : null,
    durationMin: Number(r.duration_min) || 0,
    key: String(r.activity_key),
    label: String(r.label),
    intensity,
    distanceM: r.distance_m == null ? null : Number(r.distance_m),
    kcal: Number(r.kcal) || 0,
    kcalSource: (r.kcal_source as KcalSource) ?? "estimate",
    source: (r.source as ActivitySource) ?? "quick_add",
    duplicateOf: r.duplicate_of ? String(r.duplicate_of) : null,
  };
}

/** Activities in a date range, oldest first. Empty (not an error) before the migration exists. */
export async function getActivities(userProfileId: string, from: string, to: string): Promise<Activity[]> {
  const { data, error } = await supabase
    .from("health_activities")
    .select("*")
    .eq("user_profile_id", userProfileId)
    .is("deleted_at", null)
    .gte("local_date", from)
    .lte("local_date", to)
    .order("local_date", { ascending: true });
  if (error) {
    logger.debug({ err: error.message }, "health activities unavailable");
    return [];
  }
  return ((data ?? []) as Row[]).map(rowToActivity).sort((a, b) => a.localDate.localeCompare(b.localDate) || (a.startTime ?? "").localeCompare(b.startTime ?? ""));
}

export async function latestWeightKg(userProfileId: string): Promise<number | null> {
  const { data } = await supabase
    .from("health_body_checkins")
    .select("weight_kg")
    .eq("user_profile_id", userProfileId)
    .not("weight_kg", "is", null)
    .order("local_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  const w = Number((data as { weight_kg?: unknown } | null)?.weight_kg);
  return Number.isFinite(w) && w > 0 ? w : null;
}

// ---------- training context ----------

export type TrainingContext = {
  trainingDays: number[];
  isTrainingDay: boolean;
  typicalBurn: number;
  /** Hevy workouts on the date. */
  workouts: TimedWorkout[];
  /** Dates with lifting in the last 8 weeks (Hevy, or "trained, didn't log"). */
  liftingDates: string[];
};

/** Hevy's recent sessions and the person's training days, for the training-day rules. */
export async function loadTrainingContext(userProfileId: string, timezone: string, date: string, weightKg: number): Promise<TrainingContext> {
  const [{ targets }, hevy, checks] = await Promise.all([
    loadHealthProfile(userProfileId),
    hevyHistoryCached(userProfileId).catch(() => ({ connected: false }) as const),
    getWorkoutChecks(userProfileId, localDateKey(new Date(Date.parse(`${date}T12:00:00Z`) - 7 * DAY_MS), timezone), date),
  ]);
  const sessions = hevy.connected && hevy.ok
    ? hevy.workouts.flatMap((w) => {
        if (!w.start_time) return [];
        const start = Date.parse(w.start_time);
        const end = w.end_time ? Date.parse(w.end_time) : NaN;
        return [{ startTime: new Date(start).toISOString(), durationMin: Number.isFinite(end) ? Math.max(0, Math.round((end - start) / 60_000)) : null, date: localDateKey(new Date(start), timezone) }];
      })
    : [];
  const liftingDates = new Set(sessions.map((s) => s.date));
  for (const c of checks.values()) if (c.status === "trained_unlogged" || (c.status === "found" && c.hevyWorkoutId)) liftingDates.add(c.localDate);
  return {
    trainingDays: targets.trainingDays,
    isTrainingDay: targets.trainingDays.includes(weekdayOfDate(date)),
    typicalBurn: typicalTrainingBurn(sessions.map((s) => s.durationMin ?? 0), weightKg),
    workouts: sessions.filter((s) => s.date === date).map(({ startTime, durationMin }) => ({ startTime, durationMin })),
    liftingDates: [...liftingDates],
  };
}

export type TrainingVerdict = {
  /** The sport stands in for the day's training (training day, no Hevy workout, enough burn). */
  countsAsTraining: boolean;
  /** kcal the sport needed to count. */
  neededKcal: number | null;
  note: string | null;
  short: boolean;
};

export function trainingVerdict(ctx: TrainingContext, date: string, activity: Pick<Activity, "kcal" | "key" | "label">, others: Activity[] = []): TrainingVerdict {
  const none: TrainingVerdict = { countsAsTraining: false, neededKcal: null, note: null, short: false };
  if (!ctx.isTrainingDay || ctx.workouts.length || ctx.liftingDates.includes(date) || activity.key === "walking") return none;
  const needed = Math.round(ctx.typicalBurn * 0.8);
  const candidate: Activity = { localDate: date, startTime: null, durationMin: 1, intensity: "moderate", distanceM: null, kcalSource: "estimate", source: "quick_add", duplicateOf: null, ...activity, id: "candidate" };
  const winner = trainingActivity([...others, candidate], ctx.workouts, ctx.typicalBurn);
  if (!winner || winner.id !== "candidate") {
    // Either it didn't burn enough, or another activity that day already counts.
    if (winner) return none;
    return { countsAsTraining: false, neededKcal: needed, note: `${activity.label} doesn't count as today's training: it burned about ${activity.kcal} kcal and a usual gym session for you is about ${ctx.typicalBurn} kcal (it needs ${needed}+).`, short: false };
  }
  const n = liftingNote({ date, trainingDays: ctx.trainingDays, liftingDates: ctx.liftingDates, activityLabel: activity.label });
  return { countsAsTraining: true, neededKcal: needed, note: n?.text ?? null, short: n?.short ?? false };
}

// ---------- drafts ----------

export const activityDraftInput = z.object({
  /** What they did, in their words or a catalog key ("swimming", "played football"). */
  activity: z.string().trim().min(1).max(120),
  durationMin: z.coerce.number().int().min(1).max(1440),
  intensity: z.enum(["easy", "moderate", "hard"]).optional(),
  distanceKm: z.coerce.number().min(0).max(500).optional(),
  /** kcal the person or their device gave; used as is. */
  kcal: z.coerce.number().int().min(0).max(10_000).optional(),
  date: DATE.optional(),
  /** Local "HH:MM" or an ISO time. */
  startTime: z.string().trim().max(40).optional(),
  source: z.enum(["chat", "quick_add"]).optional(),
});
export type ActivityDraftInput = z.infer<typeof activityDraftInput>;

export type ActivityDraft = {
  draftId: string;
  date: string;
  startTime: string | null;
  durationMin: number;
  key: string;
  label: string;
  intensity: Intensity;
  distanceM: number | null;
  kcal: number;
  kcalSource: KcalSource;
  met: number | null;
  weightKg: number;
  /** A Health Connect session already has this. */
  duplicateOf: { id: string; label: string; durationMin: number; kcal: number } | null;
  training: TrainingVerdict;
  source: "chat" | "quick_add";
};

function resolveStart(date: string, startTime: string | undefined, timezone: string): string | null {
  if (!startTime) return null;
  if (/^\d{1,2}:\d{2}$/.test(startTime)) {
    const [h, m] = startTime.split(":");
    return zonedInstant(date, `${h!.padStart(2, "0")}:${m}`, timezone).toISOString();
  }
  const t = Date.parse(startTime);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

/** Labels from the catalog, except "other", where their own words are kept. */
function labelFor(key: string, text: string): string {
  if (key !== "other") return catalogEntry(key).label;
  const t = text.trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1, 60) : "Other activity";
}

export async function buildActivityDraft(ctx: ActionContext, input: ActivityDraftInput): Promise<ActivityDraft | { ok: false; error: string }> {
  const now = ctx.now ?? new Date();
  const today = localDateKey(now, ctx.timezone);
  const date = input.date ?? today;
  if (date > today) return { ok: false, error: "future_date" };
  const entry = ACTIVITY_CATALOG.find((c) => c.key === input.activity) ?? matchActivity(input.activity);
  const intensity: Intensity = input.intensity ?? "moderate";
  const weightKg = (await latestWeightKg(ctx.userProfileId)) ?? FALLBACK_WEIGHT_KG;
  const distanceM = input.distanceKm ? Math.round(input.distanceKm * 1000) : null;
  const est = estimateActivityKcal({ key: entry.key, intensity, minutes: input.durationMin, weightKg, distanceM });
  const startTime = resolveStart(date, input.startTime, ctx.timezone);
  const label = labelFor(entry.key, input.activity);
  const kcal = input.kcal ?? est.kcal;

  const sameDay = await getActivities(ctx.userProfileId, date, date);
  const match = findHealthConnectMatch({ localDate: date, key: entry.key, startTime, durationMin: input.durationMin }, sameDay);
  const training = match
    ? { countsAsTraining: false, neededKcal: null, note: null, short: false }
    : trainingVerdict(await loadTrainingContext(ctx.userProfileId, ctx.timezone, date, weightKg), date, { kcal, key: entry.key, label }, sameDay);

  return {
    draftId: randomUUID(),
    date,
    startTime,
    durationMin: input.durationMin,
    key: entry.key,
    label,
    intensity,
    distanceM,
    kcal,
    kcalSource: input.kcal !== undefined ? "user" : "estimate",
    met: input.kcal !== undefined ? null : est.met,
    weightKg,
    duplicateOf: match ? { id: match.id, label: match.label, durationMin: match.durationMin, kcal: match.kcal } : null,
    training,
    source: input.source ?? "chat",
  };
}

// ---------- saving ----------

export const activitySaveInput = z.object({
  draftId: z.string().trim().min(8).max(80),
  date: DATE,
  startTime: z.string().datetime({ offset: true }).nullable().optional(),
  durationMin: z.coerce.number().int().min(1).max(1440),
  key: z.string().trim().min(1).max(40),
  label: z.string().trim().min(1).max(80),
  intensity: z.enum(["easy", "moderate", "hard"]).default("moderate"),
  distanceM: z.coerce.number().int().min(0).max(500_000).nullable().optional(),
  /** Only with kcalSource "user"; otherwise the server estimates. */
  kcal: z.coerce.number().int().min(0).max(10_000).optional(),
  kcalSource: z.enum(["user", "estimate"]).default("estimate"),
  source: z.enum(["chat", "quick_add"]).default("quick_add"),
  separateSession: z.boolean().optional(),
});
export type ActivitySaveInput = z.infer<typeof activitySaveInput>;

export type SaveActivityResult =
  | { ok: true; activity: Activity; alreadySaved: boolean; training: TrainingVerdict }
  | { ok: false; error: string };

export async function saveActivity(ctx: ActionContext, input: ActivitySaveInput): Promise<SaveActivityResult> {
  const now = ctx.now ?? new Date();
  if (input.date > localDateKey(now, ctx.timezone)) return { ok: false, error: "future_date" };

  const { data: existing } = await supabase
    .from("health_activities")
    .select("*")
    .eq("user_profile_id", ctx.userProfileId)
    .eq("draft_id", input.draftId)
    .maybeSingle();
  if (existing) return { ok: true, activity: rowToActivity(existing as Row), alreadySaved: true, training: { countsAsTraining: false, neededKcal: null, note: null, short: false } };

  const key = catalogEntry(input.key).key;
  const weightKg = (await latestWeightKg(ctx.userProfileId)) ?? FALLBACK_WEIGHT_KG;
  const est = estimateActivityKcal({ key, intensity: input.intensity, minutes: input.durationMin, weightKg, distanceM: input.distanceM ?? null });
  const userKcal = input.kcalSource === "user" && input.kcal !== undefined;
  const kcal = userKcal ? input.kcal! : est.kcal;
  const startTime = input.startTime ? new Date(input.startTime).toISOString() : null;

  const sameDay = await getActivities(ctx.userProfileId, input.date, input.date);
  const match = input.separateSession ? null : findHealthConnectMatch({ localDate: input.date, key, startTime, durationMin: input.durationMin }, sameDay);

  const { data, error } = await supabase
    .from("health_activities")
    .insert({
      user_profile_id: ctx.userProfileId,
      local_date: input.date,
      start_time: startTime,
      duration_min: input.durationMin,
      activity_key: key,
      label: input.label,
      intensity: input.intensity,
      distance_m: input.distanceM ?? null,
      kcal,
      kcal_source: userKcal ? "user" : "estimate",
      met: userKcal ? null : est.met,
      source: input.source,
      draft_id: input.draftId,
      separate_session: Boolean(input.separateSession),
      duplicate_of: match?.id ?? null,
    })
    .select("*")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "save_failed" };
  const activity = rowToActivity(data as Row);

  let training: TrainingVerdict = { countsAsTraining: false, neededKcal: null, note: null, short: false };
  if (!match) {
    try {
      training = await trainingFollowUp(ctx, activity, sameDay, weightKg);
    } catch (err) {
      logger.warn({ err: err instanceof Error ? err.message : String(err) }, "activity training follow-up failed");
    }
  }
  return { ok: true, activity, alreadySaved: false, training };
}

/**
 * When the activity stands in for a training day: mark the day's workout check as done (so the
 * north star and the chat card agree), and post the strength-plan note in chat.
 */
async function trainingFollowUp(ctx: ActionContext, activity: Activity, others: Activity[], weightKg: number): Promise<TrainingVerdict> {
  const tctx = await loadTrainingContext(ctx.userProfileId, ctx.timezone, activity.localDate, weightKg);
  const verdict = trainingVerdict(tctx, activity.localDate, activity, others);
  if (!verdict.countsAsTraining) return verdict;
  const { gym } = await loadHealthProfile(ctx.userProfileId);
  await saveWorkoutCheckAnswer(ctx.userProfileId, {
    localDate: activity.localDate,
    gymTime: gym.time ?? "00:00",
    status: "found",
    hevyWorkoutId: null,
    reason: `${activity.label} · ${activity.durationMin} min`,
  });
  // From chat, the coach already said it under the card; from the tracker, say it in chat now.
  if (verdict.note && activity.source !== "chat") await postCoachMessage(ctx.userProfileId, verdict.note, []);
  return verdict;
}

export async function deleteActivity(ctx: ActionContext, id: string): Promise<{ ok: boolean; error?: string }> {
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "invalid_id" };
  const { data, error } = await supabase
    .from("health_activities")
    .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("user_profile_id", ctx.userProfileId)
    .eq("id", id)
    .is("deleted_at", null)
    .select("id, local_date, label, duration_min");
  if (error) return { ok: false, error: error.message };
  const row = (data ?? [])[0] as Row | undefined;
  if (!row) return { ok: false, error: "activity_not_found" };
  // If this activity had stood in for the day's workout, the day goes back to "not done".
  const checks = await getWorkoutChecks(ctx.userProfileId, String(row.local_date), String(row.local_date));
  const c = checks.get(String(row.local_date));
  if (c && c.status === "found" && !c.hevyWorkoutId && c.reason === `${row.label} · ${row.duration_min} min`) {
    await saveWorkoutCheckAnswer(ctx.userProfileId, { ...c, status: "missing", reason: null });
  }
  return { ok: true };
}

// ---------- Health Connect ----------

export type ExerciseSample = { startTime: string; endTime: string; localDate: string; value: number; detail: Record<string, unknown> };

/** A session's own calories, when the phone sent them under one of the usual names. */
export function sessionKcal(detail: Record<string, unknown>): number | null {
  for (const k of ["calories", "active_calories", "total_calories", "energy_kcal", "kcal"]) {
    const v = Number(detail[k]);
    if (Number.isFinite(v) && v > 0) return Math.round(v);
  }
  return null;
}

/**
 * Turns Health Connect exercise sessions (except walks) into activities. A session already stored
 * is left as it is, so edits and deletes stick. Manual entries the session covers are marked as
 * duplicates so they aren't counted twice.
 */
export async function syncHealthConnectActivities(ctx: ActionContext, sessions: ExerciseSample[]): Promise<number> {
  const rows: Row[] = [];
  let weightKg: number | null = null;
  for (const s of sessions) {
    const type = String(s.detail.type ?? "");
    const key = healthConnectActivityKey(type);
    if (!key) continue;
    const minutes = Math.max(1, Math.round(s.value / 60));
    if (minutes < 5) continue;
    weightKg ??= (await latestWeightKg(ctx.userProfileId)) ?? FALLBACK_WEIGHT_KG;
    const distanceM = Number(s.detail.distance_meters) > 0 ? Math.round(Number(s.detail.distance_meters)) : null;
    const device = sessionKcal(s.detail);
    const est = estimateActivityKcal({ key, intensity: "moderate", minutes, weightKg, distanceM });
    rows.push({
      user_profile_id: ctx.userProfileId,
      local_date: s.localDate,
      start_time: s.startTime,
      duration_min: Math.min(1440, minutes),
      activity_key: key,
      label: labelFor(key, type.replace(/^EXERCISE_TYPE_/i, "").replace(/_/g, " ").toLowerCase()),
      intensity: "moderate",
      distance_m: distanceM,
      kcal: device ?? est.kcal,
      kcal_source: device ? "device" : "estimate",
      met: device ? null : est.met,
      source: "health_connect",
      external_id: s.startTime,
    });
  }
  if (!rows.length) return 0;
  const { error } = await supabase
    .from("health_activities")
    .upsert(rows, { onConflict: "user_profile_id,source,external_id", ignoreDuplicates: true });
  if (error) {
    logger.warn({ err: error.message }, "health connect: activities not stored");
    return 0;
  }

  const dates = [...new Set(rows.map((r) => String(r.local_date)))].sort();
  const { data: stored } = await supabase
    .from("health_activities")
    .select("*")
    .eq("user_profile_id", ctx.userProfileId)
    .is("deleted_at", null)
    .gte("local_date", dates[0]!)
    .lte("local_date", dates[dates.length - 1]!);
  const all = ((stored ?? []) as Row[]).map((r) => ({ a: rowToActivity(r), separate: Boolean(r.separate_session) }));
  const activities = all.map((x) => x.a);
  for (const { a, separate } of all) {
    if (a.source === "health_connect" || a.duplicateOf || separate) continue;
    const match = findHealthConnectMatch(a, activities);
    if (match) await supabase.from("health_activities").update({ duplicate_of: match.id, updated_at: new Date().toISOString() }).eq("id", a.id);
  }
  return rows.length;
}

// ---------- catalog for the quick-add sheet ----------

export type ActivityCatalog = {
  weightKg: number;
  activities: Array<{ key: string; label: string; met: [number, number, number] }>;
  /** The person's own activities, most frequent first, with their usual length and intensity. */
  recent: Array<{ key: string; label: string; durationMin: number; intensity: Intensity; count: number }>;
};

export async function loadActivityCatalog(ctx: ActionContext): Promise<ActivityCatalog> {
  const now = ctx.now ?? new Date();
  const to = localDateKey(now, ctx.timezone);
  const from = localDateKey(new Date(now.getTime() - 60 * DAY_MS), ctx.timezone);
  const [weight, past] = await Promise.all([latestWeightKg(ctx.userProfileId), getActivities(ctx.userProfileId, from, to)]);
  const byKey = new Map<string, { label: string; mins: number[]; intensity: Intensity; count: number; last: string }>();
  for (const a of past) {
    if (a.duplicateOf) continue;
    const id = a.key === "other" ? `other:${a.label.toLowerCase()}` : a.key;
    const e = byKey.get(id) ?? { label: a.label, mins: [], intensity: a.intensity, count: 0, last: "" };
    e.mins.push(a.durationMin);
    e.count += 1;
    if (a.localDate >= e.last) {
      e.last = a.localDate;
      e.intensity = a.intensity;
    }
    byKey.set(id, e);
  }
  const recent = [...byKey.entries()]
    .sort((a, b) => b[1].count - a[1].count || b[1].last.localeCompare(a[1].last))
    .slice(0, 6)
    .map(([id, e]) => {
      const sorted = [...e.mins].sort((x, y) => x - y);
      return { key: id.startsWith("other:") ? "other" : id, label: e.label, durationMin: sorted[Math.floor((sorted.length - 1) / 2)]!, intensity: e.intensity, count: e.count };
    });
  return {
    weightKg: weight ?? FALLBACK_WEIGHT_KG,
    activities: ACTIVITY_CATALOG.filter((c) => c.key !== "walking").map((c) => ({ key: c.key, label: c.label, met: c.met })),
    recent,
  };
}
