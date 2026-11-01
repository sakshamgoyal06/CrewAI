/**
 * Android steps, walks and weigh-ins from Health Connect, pushed by the HC Webhook app
 * (github.com/mcnaveen/health-connect-webhook) to `POST /api/health/ingest/health-connect`.
 *
 * HC Webhook sends only new or changed records per sync, and re-sends a whole bucket when it
 * changes. So buckets are upserted by (kind, start_time) and the day's totals are rebuilt from
 * every stored bucket of that day, never added on top of the previous total.
 */
import { z } from "zod";

import { localDateKey } from "../nutrition/localDate.js";
import { supabase } from "../tools/clients.js";
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
    weight: z.array(z.object({ kilograms: z.coerce.number().positive(), time: iso }).passthrough()).optional(),
    body_fat: z.array(z.object({ percentage: z.coerce.number().positive(), time: iso }).passthrough()).optional(),
  })
  .passthrough();

export type HealthConnectPayload = z.infer<typeof healthConnectPayload>;

export type ActivitySample = {
  kind: "steps" | "distance" | "exercise";
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
};

const toIso = (s: string): string => new Date(s).toISOString();

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

  // Several scale readings on one day: keep the latest of each metric.
  const latest = new Map<string, { time: string; value: number }>();
  const keep = (metric: "weightKg" | "bodyFatPct", time: string, value: number) => {
    const key = `${day(time)}|${metric}`;
    const prev = latest.get(key);
    if (!prev || Date.parse(time) >= Date.parse(prev.time)) latest.set(key, { time, value });
  };
  for (const w of payload.weight ?? []) keep("weightKg", w.time, w.kilograms);
  for (const b of payload.body_fat ?? []) keep("bodyFatPct", b.time, b.percentage);
  const byDay = new Map<string, ScaleReading>();
  for (const [key, { time, value }] of latest) {
    const [localDate, metric] = key.split("|") as [string, "weightKg" | "bodyFatPct"];
    const r = byDay.get(localDate) ?? { localDate, time };
    r[metric] = Math.round(value * 10) / 10;
    if (Date.parse(time) > Date.parse(r.time)) r.time = time;
    byDay.set(localDate, r);
  }
  const scale = [...byDay.values()];

  return { samples, scale };
}

export type DayTotals = { steps: number; distanceM: number; walkMinutes: number };

export function totalsFromSamples(
  rows: Array<{ kind: string; value: number; detail: Record<string, unknown> | null }>,
): DayTotals {
  let steps = 0;
  let distanceM = 0;
  let walkSeconds = 0;
  for (const r of rows) {
    if (r.kind === "steps") steps += r.value;
    else if (r.kind === "distance") distanceM += r.value;
    else if (r.kind === "exercise" && isWalkType(String(r.detail?.type ?? ""))) walkSeconds += r.value;
  }
  return { steps: Math.round(steps), distanceM: Math.round(distanceM), walkMinutes: Math.round(walkSeconds / 60) };
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

  if (samples.length > 0) {
    const { error } = await supabase.from("health_activity_samples").upsert(
      samples.map((s) => ({
        user_profile_id: ctx.userProfileId,
        kind: s.kind,
        start_time: s.startTime,
        end_time: s.endTime,
        local_date: s.localDate,
        value: s.value,
        detail: s.detail,
        source: "health_connect",
        updated_at: new Date().toISOString(),
      })),
      { onConflict: "user_profile_id,kind,start_time" },
    );
    if (error) return { ok: false, error: error.message };
  }

  const dates = [...new Set(samples.map((s) => s.localDate))].filter((d) => d <= today).sort();
  const days: IngestResult["days"] = [];
  for (const date of dates) {
    const { data, error } = await supabase
      .from("health_activity_samples")
      .select("kind, value, detail")
      .eq("user_profile_id", ctx.userProfileId)
      .eq("local_date", date);
    if (error) return { ok: false, error: error.message };
    const totals = totalsFromSamples(
      (data ?? []).map((r) => ({
        kind: String(r.kind),
        value: Number(r.value) || 0,
        detail: (r.detail as Record<string, unknown>) ?? null,
      })),
    );
    const saved = await upsertDailyActivity(ctx.userProfileId, {
      localDate: date,
      steps: totals.steps,
      walkMinutes: totals.walkMinutes,
      walkDistanceM: totals.distanceM,
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
    const { error } = await supabase.from("health_body_checkins").upsert(
      {
        user_profile_id: ctx.userProfileId,
        local_date: r.localDate,
        weight_kg: r.weightKg ?? existing?.weight_kg ?? null,
        body_fat_pct: r.bodyFatPct ?? existing?.body_fat_pct ?? null,
        muscle_mass_kg: existing?.muscle_mass_kg ?? null,
        note: existing?.note ?? "Health Connect",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_profile_id,local_date" },
    );
    if (error) return { ok: false, error: error.message };
    weighIns += 1;
  }

  return { ok: true, samples: samples.length, days, weighIns };
}
