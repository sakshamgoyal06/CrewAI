import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  samples: [] as Array<Record<string, unknown>>,
  checkins: new Map<string, Record<string, unknown>>(),
}));
const activityMock = vi.hoisted(() => vi.fn(async () => ({ ok: true as const })));

vi.mock("../tools/clients.js", () => {
  const from = (table: string) => ({
    upsert: async (rows: Record<string, unknown> | Array<Record<string, unknown>>) => {
      for (const row of Array.isArray(rows) ? rows : [rows]) {
        if (table === "health_activity_samples") {
          const i = db.samples.findIndex((s) => s.kind === row.kind && s.start_time === row.start_time);
          if (i >= 0) db.samples[i] = row;
          else db.samples.push(row);
        } else {
          db.checkins.set(String(row.local_date), row);
        }
      }
      return { error: null };
    },
    select: () => {
      const filters: Record<string, unknown> = {};
      const chain = {
        eq: (k: string, v: unknown) => {
          filters[k] = v;
          return chain;
        },
        maybeSingle: async () => ({ data: db.checkins.get(String(filters.local_date)) ?? null, error: null }),
        then: (resolve: (v: unknown) => void) =>
          resolve({ data: db.samples.filter((s) => s.local_date === filters.local_date), error: null }),
      };
      return chain;
    },
  });
  return { supabase: { from }, redis: {}, anthropic: {} };
});
vi.mock("./activityStore.js", () => ({ upsertDailyActivity: activityMock, ACTIVITY_SOURCES: [] }));

import { healthConnectPayload, ingestHealthConnect, isWalkType, parseHealthConnect, totalsFromSamples } from "./healthConnect.js";

const ctx = { userProfileId: "p1", timezone: "Asia/Kolkata", now: new Date("2026-10-27T15:00:00Z") };

beforeEach(() => {
  db.samples = [];
  db.checkins = new Map();
  activityMock.mockClear();
});

describe("parseHealthConnect", () => {
  it("assigns buckets to the user's local day", () => {
    const { samples } = parseHealthConnect(
      healthConnectPayload.parse({
        timestamp: "x",
        app_version: "1",
        steps: [
          { count: 1200, start_time: "2026-10-26T19:00:00Z", end_time: "2026-10-26T20:00:00Z" }, // 00:30 IST on the 27th
          { count: 800, start_time: "2026-10-26T17:00:00Z", end_time: "2026-10-26T18:00:00Z" }, // 22:30 IST on the 26th
        ],
      }),
      "Asia/Kolkata",
    );
    expect(samples.map((s) => [s.localDate, s.value])).toEqual([["2026-10-27", 1200], ["2026-10-26", 800]]);
  });

  it("keeps the latest scale reading per day and metric", () => {
    const { scale } = parseHealthConnect(
      healthConnectPayload.parse({
        weight: [
          { kilograms: 84.46, time: "2026-10-27T01:00:00Z" },
          { kilograms: 84.12, time: "2026-10-27T02:00:00Z" },
        ],
        body_fat: [{ percentage: 20.04, time: "2026-10-27T01:00:00Z" }],
      }),
      "Asia/Kolkata",
    );
    expect(scale).toEqual([{ localDate: "2026-10-27", time: "2026-10-27T02:00:00Z", weightKg: 84.1, bodyFatPct: 20 }]);
  });

  it("rejects malformed records", () => {
    expect(healthConnectPayload.safeParse({ steps: [{ count: 5, start_time: "nope", end_time: "x" }] }).success).toBe(false);
  });
});

describe("totalsFromSamples", () => {
  it("sums steps and distance and counts only walk-like sessions", () => {
    expect(
      totalsFromSamples([
        { kind: "steps", value: 4000, detail: {} },
        { kind: "steps", value: 2500, detail: {} },
        { kind: "distance", value: 3200.4, detail: {} },
        { kind: "exercise", value: 1800, detail: { type: "WALKING" } },
        { kind: "exercise", value: 3600, detail: { type: "STRENGTH_TRAINING" } },
        { kind: "exercise", value: 600, detail: { type: "EXERCISE_TYPE_HIKING" } },
      ]),
    ).toEqual({ steps: 6500, distanceM: 3200, walkMinutes: 40 });
    expect(isWalkType("running")).toBe(false);
  });
});

describe("ingestHealthConnect", () => {
  const bucket = (h: number, count: number) => ({
    count,
    start_time: `2026-10-27T0${h}:00:00Z`,
    end_time: `2026-10-27T0${h + 1}:00:00Z`,
  });

  it("rebuilds the day's total so a re-sent bucket replaces instead of adding", async () => {
    await ingestHealthConnect(ctx, healthConnectPayload.parse({ steps: [bucket(3, 1000), bucket(4, 2000)] }));
    expect(activityMock).toHaveBeenLastCalledWith("p1", expect.objectContaining({ localDate: "2026-10-27", steps: 3000, source: "health_connect" }));

    // Next sync: hour 4 was edited (2000 -> 2500), hour 5 is new.
    const r = await ingestHealthConnect(ctx, healthConnectPayload.parse({ steps: [bucket(4, 2500), bucket(5, 700)] }));
    expect(activityMock).toHaveBeenLastCalledWith("p1", expect.objectContaining({ steps: 4200 }));
    expect(r).toMatchObject({ ok: true, samples: 2, days: [{ date: "2026-10-27", steps: 4200 }] });
  });

  it("merges a scale reading into an existing check-in without wiping manual fields", async () => {
    db.checkins.set("2026-10-27", { local_date: "2026-10-27", weight_kg: 85, body_fat_pct: null, muscle_mass_kg: 37.5, note: "manual" });
    await ingestHealthConnect(ctx, healthConnectPayload.parse({ weight: [{ kilograms: 84.2, time: "2026-10-27T02:00:00Z" }] }));
    expect(db.checkins.get("2026-10-27")).toMatchObject({ weight_kg: 84.2, muscle_mass_kg: 37.5, note: "manual" });
  });

  it("ignores future days", async () => {
    const r = await ingestHealthConnect(
      ctx,
      healthConnectPayload.parse({ steps: [{ count: 10, start_time: "2026-10-29T03:00:00Z", end_time: "2026-10-29T04:00:00Z" }] }),
    );
    expect(r).toMatchObject({ ok: true, days: [] });
    expect(activityMock).not.toHaveBeenCalled();
  });
});
