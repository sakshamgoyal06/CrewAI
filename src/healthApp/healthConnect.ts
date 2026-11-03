/**
 * Android steps, walks, sleep, resting heart rate and weigh-ins from Health Connect, pushed to
 * `POST /api/health/ingest/health-connect` by the Magnus Android app (android/) or, as a fallback,
 * the HC Webhook app (github.com/mcnaveen/health-connect-webhook).
 *
 * HC Webhook sends only new or changed records per sync, and re-sends a whole bucket when it
 * changes. So buckets are upserted by (kind, start_time) and the day's totals are rebuilt from
 * every stored bucket of that day, never added on top of the previous total.
 */
import { z } from "zod";

import { logger } from "../logger.js";
import { localDateKey } from "../nutrition/localDate.js";
import { supabase } from "../tools/clients.js";
import { syncHealthConnectActivities } from "./activityLog.js";
import { upsertDailyActivity } from "./activityStore.js";
import type { ActionContext } from "./actions.js";

const iso = z.string().refine((s) => !Number.isNaN(Date.parse(s)), "expected ISO-8601 time");
const interval = { start_time: iso, end_time: iso };

/** Only the parts we use; unknown types and fields are ignored. */
export const healthConnectPayload = z
  .object({
    steps: z.array(z.object({ count: z.coerce.number().min(0), ...interval }).passthrough()).optional(),
    distance: z.array(z.object({ meters: z.coerce.number().min(0), ...interval }).passthrough()).optional(),
    exercise: z
      .array(
        z
          .object({
            type: z.string(),
            duration_seconds: z.coerce.number().min(0).optional(),
            distance_meters: z.coerce.number().min(0).optional(),
            ...interval,
          })
          .passthrough(),
      )
      .optional(),
    active_calories: z.array(z.object({ calories: z.coerce.number().min(0), ...interval }).passthrough()).optional(),
    /** Everything burned, resting metabolism included (Health Connect "Total calories burned"). */
    total_calories: z.array(z.object({ calories: z.coerce.number().min(0), ...interval }).passthrough()).optional(),
    /** Heart rate variability (RMSSD, milliseconds). */
    hrv: z.array(z.object({ rmssd_ms: z.coerce.number().min(1).max(500), time: iso }).passthrough()).optional(),
    lean_body_mass: z.array(z.object({ kilograms: z.coerce.number().positive(), time: iso }).passthrough()).optional(),
    weight: z.array(z.object({ kilograms: z.coerce.number().positive(), time: iso }).passthrough()).optional(),
    body_fat: z.array(z.object({ percentage: z.coerce.number().positive(), time: iso }).passthrough()).optional(),
    /** Sleep sessions; asleep_seconds leaves out awake stages when the tracker records them. */
    sleep: z
      .array(z.object({ asleep_seconds: z.coerce.number().min(0).optional(), ...interval }).passthrough())
      .optional(),
    /**
     * Sent by the Magnus Android app: the whole span its hourly aggregates cover. Stored steps,
     * distance and calories buckets in that span are replaced, so a sync whose buckets start at
     * different minutes can't stack on top of an earlier one.
     */
    synced_range: z.object({ start_time: iso, end_time: iso }).optional(),
    resting_heart_rate: z
      .array(z.object({ bpm: z.coerce.number().min(20).max(250), time: iso }).passthrough())
      .optional(),
  })
  .passthrough();

export type HealthConnectPayload = z.infer<typeof healthConnectPayload>;

export type ActivitySample = {
  kind: "steps" | "distance" | "exercise" | "active_calories" | "total_calories" | "sleep" | "resting_hr" | "hrv";
  startTime: string;
  endTime: string;
  localDate: string;
  value: number;
  detail: Record<string, unknown>;
};

export type ScaleReading = {
  localDate: string;
  time: string;
  weightKg?: number;
  bodyFatPct?: number;
  leanMassKg?: number;
};

const toIso = (s: string): string => new Date(s).toISOString();

/** Kinds the Android app sends as hourly aggregates (the rest are individual records). */
const AGGREGATED = ["steps", "distance", "active_calories", "total_calories"] as const;

/** Walk-like sessions count toward walk minutes. */
export function isWalkType(type: string): boolean {
  return /walk|hik/i.test(type);
}

export function parseHealthConnect(payload: HealthConnectPayload, timezone: string) {
  const samples: ActivitySample[] = [];
  const day = (t: string) => localDateKey(new Date(t), timezone);

  for (const s of payload.steps ?? []) {
    samples.push({ kind: "steps", startTime: toIso(s.start_time), endTime: toIso(s.end_time), localDate: day(s.start_time), value: Math.round(s.count), detail: {} });
  }
  for (const d of payload.distance ?? []) {
    samples.push({ kind: "distance", startTime: toIso(d.start_time), endTime: toIso(d.end_time), localDate: day(d.start_time), value: d.meters, detail: {} });
  }
  for (const c of payload.total_calories ?? []) {
    samples.push({ kind: "total_calories", startTime: toIso(c.start_time), endTime: toIso(c.end_time), localDate: day(c.start_time), value: Math.round(c.calories * 10) / 10, detail: {} });
  }
  for (const v of payload.hrv ?? []) {
    samples.push({ kind: "hrv", startTime: toIso(v.time), endTime: toIso(v.time), localDate: day(v.time), value: Math.round(v.rmssd_ms * 10) / 10, detail: {} });
  }
  for (const c of payload.active_calories ?? []) {
    samples.push({ kind: "active_calories", startTime: toIso(c.start_time), endTime: toIso(c.end_time), localDate: day(c.start_time), value: Math.round(c.calories * 10) / 10, detail: {} });
  }
  for (const e of payload.exercise ?? []) {
    const seconds =
      e.duration_seconds ?? Math.max(0, (Date.parse(e.end_time) - Date.parse(e.start_time)) / 1000);
    samples.push({
      kind: "exercise",
      startTime: toIso(e.start_time),
      endTime: toIso(e.end_time),
      localDate: day(e.start_time),
      value: Math.round(seconds),
      detail: { type: e.type, distance_meters: e.distance_meters ?? null },
    });
  }

  // A night's sleep belongs to the day you wake up.
  for (const n of payload.sleep ?? []) {
    const span = Math.max(0, (Date.parse(n.end_time) - Date.parse(n.start_time)) / 1000);
    const asleep = Math.min(span, n.asleep_seconds ?? span);
    if (asleep <= 0) continue;
    samples.push({ kind: "sleep", startTime: toIso(n.start_time), endTime: toIso(n.end_time), localDate: day(n.end_time), value: Math.round(asleep), detail: {} });
  }
  for (const h of payload.resting_heart_rate ?? []) {
    samples.push({ kind: "resting_hr", startTime: toIso(h.time), endTime: toIso(h.time), localDate: day(h.time), value: Math.round(h.bpm), detail: {} });
  }

  // Several scale readings on one day: keep the latest of each metric.
  const latest = new Map<string, { time: string; value: number }>();
  const keep = (metric: "weightKg" | "bodyFatPct" | "leanMassKg", time: string, value: number) => {
    const key = `${day(time)}|${metric}`;
    const prev = latest.get(key);
    if (!prev || Date.parse(time) >= Date.parse(prev.time)) latest.set(key, { time, value });
  };
  for (const w of payload.weight ?? []) keep("weightKg", w.time, w.kilograms);
  for (const b of payload.body_fat ?? []) keep("bodyFatPct", b.time, b.percentage);
  for (const l of payload.lean_body_mass ?? []) keep("leanMassKg", l.time, l.kilograms);
  const byDay = new Map<string, ScaleReading>();
  for (const [key, { time, value }] of latest) {
    const [localDate, metric] = key.split("|") as [string, "weightKg" | "bodyFatPct" | "leanMassKg"];
    const r = byDay.get(localDate) ?? { localDate, time };
    r[metric] = Math.round(value * 10) / 10;
    if (Date.parse(time) > Date.parse(r.time)) r.time = time;
    byDay.set(localDate, r);
  }
  const scale = [...byDay.values()];

  return { samples, scale };
}

/** Everything after walkMinutes is null when the phone sent none of it for the day. */
export type DayTotals = {
  steps: number;
  distanceM: number;
  walkMinutes: number;
  activeKcal: number | null;
  totalKcal: number | null;
  sleepMinutes: number | null;
  restingHr: number | null;
  hrvMs: number | null;
};

type SampleRow = { kind: string; value: number; detail: Record<string, unknown> | null; start_time?: string; end_time?: string };

/** Phone and watch can both record the same night: keep the longest of overlapping sessions. */
function sleepSeconds(rows: SampleRow[]): number | null {
  const sessions = rows.filter((r) => r.kind === "sleep");
  if (!sessions.length) return null;
  const kept: SampleRow[] = [];
  for (const r of [...sessions].sort((a, b) => b.value - a.value)) {
    const s = Date.parse(r.start_time ?? "");
    const e = Date.parse(r.end_time ?? "");
    const overlaps = Number.isFinite(s) && Number.isFinite(e) && kept.some((k) => s < Date.parse(k.end_time!) && Date.parse(k.start_time!) < e);
    if (!overlaps) kept.push(r);
  }
  return kept.reduce((t, r) => t + r.value, 0);
}

export function totalsFromSamples(rows: SampleRow[]): DayTotals {
  let steps = 0;
  let distanceM = 0;
  let walkSeconds = 0;
  let activeKcal: number | null = null;
  const asleep = sleepSeconds(rows);
  let restingHr: number | null = null;
  let totalKcal: number | null = null;
  const hrv: number[] = [];
  for (const r of rows) {
    if (r.kind === "active_calories") activeKcal = (activeKcal ?? 0) + r.value;
    if (r.kind === "total_calories") totalKcal = (totalKcal ?? 0) + r.value;
    if (r.kind === "hrv" && r.value > 0) hrv.push(r.value);
    // Several readings in a day: the lowest is the resting rate.
    if (r.kind === "resting_hr" && r.value > 0) restingHr = restingHr === null ? r.value : Math.min(restingHr, r.value);
    if (r.kind === "steps") steps += r.value;
    else if (r.kind === "distance") distanceM += r.value;
    else if (r.kind === "exercise" && isWalkType(String(r.detail?.type ?? ""))) walkSeconds += r.value;
  }
  return {
    steps: Math.round(steps),
    distanceM: Math.round(distanceM),
    walkMinutes: Math.round(walkSeconds / 60),
    activeKcal: activeKcal === null ? null : Math.round(activeKcal),
    sleepMinutes: asleep === null ? null : Math.min(1440, Math.round(asleep / 60)),
    restingHr: restingHr === null ? null : Math.round(restingHr),
    totalKcal: totalKcal === null ? null : Math.round(totalKcal),
    hrvMs: hrv.length ? Math.round(hrv.reduce((a, b) => a + b, 0) / hrv.length) : null,
  };
}

export type IngestResult = {
  ok: true;
  samples: number;
  days: Array<{ date: string } & DayTotals>;
  weighIns: number;
};

export async function ingestHealthConnect(
  ctx: ActionContext,
  payload: HealthConnectPayload,
): Promise<IngestResult | { ok: false; error: string }> {
  const { samples, scale } = parseHealthConnect(payload, ctx.timezone);
  const today = localDateKey(ctx.now ?? new Date(), ctx.timezone);

  const toRows = (list: ActivitySample[]) =>
    list.map((s) => ({
        user_profile_id: ctx.userProfileId,
        kind: s.kind,
        start_time: s.startTime,
        end_time: s.endTime,
        local_date: s.localDate,
        value: s.value,
        detail: s.detail,
        source: "health_connect",
        updated_at: new Date().toISOString(),
      }));
  // Calories, sleep and heart rate are extra: if the database predates them, steps and walks
  // still go through.
  const EXTRA = new Set<ActivitySample["kind"]>(["active_calories", "total_calories", "sleep", "resting_hr", "hrv"]);
  const core = samples.filter((s) => !EXTRA.has(s.kind));
  const extra = samples.filter((s) => EXTRA.has(s.kind));
  if (payload.synced_range) {
    const { error } = await supabase
      .from("health_activity_samples")
      .delete()
      .eq("user_profile_id", ctx.userProfileId)
      .in("kind", [...AGGREGATED])
      .gte("start_time", toIso(payload.synced_range.start_time))
      .lt("start_time", toIso(payload.synced_range.end_time));
    if (error) return { ok: false, error: error.message };
  }
  if (core.length > 0) {
    const { error } = await supabase
      .from("health_activity_samples")
      .upsert(toRows(core), { onConflict: "user_profile_id,kind,start_time" });
    if (error) return { ok: false, error: error.message };
  }
  for (const kind of EXTRA) {
    const rows = extra.filter((s) => s.kind === kind);
    if (!rows.length) continue;
    const { error } = await supabase
      .from("health_activity_samples")
      .upsert(toRows(rows), { onConflict: "user_profile_id,kind,start_time" });
    if (error) logger.warn({ err: error.message, kind }, "health connect: extra samples not stored");
  }

  // Swims, runs, sports... recorded by the phone or a watch become activities in the tracker.
  const sessions = samples.filter((s) => s.kind === "exercise" && s.localDate <= today);
  if (sessions.length) {
    await syncHealthConnectActivities(ctx, sessions).catch((err) =>
      logger.warn({ err: err instanceof Error ? err.message : String(err) }, "health connect: activity sync failed"),
    );
  }

  const touched = new Set(samples.map((s) => s.localDate));
  if (payload.synced_range) {
    // Every day in the replaced span gets its totals rebuilt, even one that now has no buckets.
    const end = Math.min(Date.parse(payload.synced_range.end_time), (ctx.now ?? new Date()).getTime());
    for (let t = Date.parse(payload.synced_range.start_time); t <= end; t += 6 * 3600_000) {
      touched.add(localDateKey(new Date(t), ctx.timezone));
    }
    touched.add(localDateKey(new Date(end), ctx.timezone));
  }
  const dates = [...touched].filter((d) => d <= today).sort();
  const days: IngestResult["days"] = [];
  for (const date of dates) {
    const { data, error } = await supabase
      .from("health_activity_samples")
      .select("kind, value, detail, start_time, end_time")
      .eq("user_profile_id", ctx.userProfileId)
      .eq("local_date", date);
    if (error) return { ok: false, error: error.message };
    const totals = totalsFromSamples(
      (data ?? []).map((r) => ({
        kind: String(r.kind),
        value: Number(r.value) || 0,
        detail: (r.detail as Record<string, unknown>) ?? null,
        start_time: r.start_time ? String(r.start_time) : undefined,
        end_time: r.end_time ? String(r.end_time) : undefined,
      })),
    );
    const saved = await upsertDailyActivity(ctx.userProfileId, {
      localDate: date,
      steps: totals.steps,
      walkMinutes: totals.walkMinutes,
      walkDistanceM: totals.distanceM,
      activeKcal: totals.activeKcal,
      sleepMinutes: totals.sleepMinutes,
      restingHr: totals.restingHr,
      totalKcal: totals.totalKcal,
      hrvMs: totals.hrvMs,
      source: "health_connect",
    });
    if (!saved.ok) return saved;
    days.push({ date, ...totals });
  }

  let weighIns = 0;
  for (const r of scale) {
    if (r.localDate > today) continue;
    // Merge into the day's check-in so a scale sync doesn't wipe a manually entered field.
    const { data: existing } = await supabase
      .from("health_body_checkins")
      .select("weight_kg, body_fat_pct, muscle_mass_kg, note")
      .eq("user_profile_id", ctx.userProfileId)
      .eq("local_date", r.localDate)
      .maybeSingle();
    // A lean-mass-only reading doesn't start a check-in on its own.
    if (r.weightKg == null && r.bodyFatPct == null && !existing) continue;
    const row: Record<string, unknown> = {
      user_profile_id: ctx.userProfileId,
      local_date: r.localDate,
      weight_kg: r.weightKg ?? existing?.weight_kg ?? null,
      body_fat_pct: r.bodyFatPct ?? existing?.body_fat_pct ?? null,
      muscle_mass_kg: existing?.muscle_mass_kg ?? null,
      note: existing?.note ?? "Health Connect",
      updated_at: new Date().toISOString(),
    };
    if (r.leanMassKg != null) row.lean_mass_kg = r.leanMassKg;
    const write = (v: Record<string, unknown>) =>
      supabase.from("health_body_checkins").upsert(v, { onConflict: "user_profile_id,local_date" });
    let { error } = await write(row);
    // Before the lean_mass_kg migration the column doesn't exist; keep weight and body fat.
    if (error && "lean_mass_kg" in row && error.message.includes("lean_mass_kg")) {
      delete row.lean_mass_kg;
      ({ error } = await write(row));
    }
    if (error) return { ok: false, error: error.message };
    weighIns += 1;
  }

  return { ok: true, samples: samples.length, days, weighIns };
}
