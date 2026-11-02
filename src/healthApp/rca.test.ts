import { describe, expect, it, vi } from "vitest";

vi.mock("../tools/clients.js", () => ({ supabase: {}, redis: {}, anthropic: {} }));

import type { HealthTargets } from "./northStar.js";
import {
  buildDayRecords,
  checkHitRate,
  experimentOutcome,
  fallbackInsight,
  findSignals,
  rcaDue,
  runRca,
  writeInsight,
  type DayRecord,
} from "./rca.js";

const targets: HealthTargets = { calorieTarget: 2200, proteinTarget: 150, stepTarget: 8000, trainingDays: [1, 3, 5], minMealSessions: 3 };
const TZ = "Asia/Kolkata";

/** 14 days from Mon 2026-10-12; `day(i)` lets each test shape one day. */
function records(shape: (i: number, weekday: number) => Partial<{ meals: Array<[string, number, number, string]>; steps: number; workout: boolean; skip: string }>): DayRecord[] {
  const dates = Array.from({ length: 14 }, (_, i) => new Date(Date.UTC(2026, 9, 12 + i)).toISOString().slice(0, 10));
  const meals: Array<{ local_date: string; meal_session_id: string; meal_slot: string; calories: number; protein_g: number; logged_at: string }> = [];
  const steps = new Map<string, number>();
  const workoutDates = new Set<string>();
  const checks = new Map<string, { status: string; reason: string | null }>();
  dates.forEach((d, i) => {
    const wd = new Date(`${d}T12:00:00Z`).getUTCDay();
    const s = shape(i, wd);
    (s.meals ?? []).forEach(([slot, kcal, prot, time], j) =>
      meals.push({ local_date: d, meal_session_id: `${d}-${j}`, meal_slot: slot, calories: kcal, protein_g: prot, logged_at: `${d}T${time}:00+05:30` }),
    );
    steps.set(d, s.steps ?? 9000);
    if (s.workout) workoutDates.add(d);
    if (s.skip) checks.set(d, { status: "skipped", reason: s.skip });
  });
  return buildDayRecords({ dates, timezone: TZ, targets, meals, steps, workoutDates, checks });
}

const goodDay: Array<[string, number, number, string]> = [
  ["breakfast", 500, 40, "08:30"],
  ["lunch", 800, 55, "13:30"],
  ["dinner", 800, 60, "20:00"],
];

describe("buildDayRecords", () => {
  it("scores each day and reads the last meal hour in the user's timezone", () => {
    const r = records(() => ({ meals: goodDay, workout: true }));
    expect(r).toHaveLength(14);
    expect(r[0]!.score.onTrack).toBe(true);
    expect(r[0]!.lastMealHour).toBe(20);
    expect(r[0]!.slots).toEqual(["breakfast", "lunch", "dinner"]);
  });
});

describe("findSignals", () => {
  it("finds weekend step drops", () => {
    const r = records((_, wd) => ({ meals: goodDay, workout: true, steps: wd === 0 || wd === 6 ? 3000 : 9500 }));
    const s = findSignals(r, targets);
    expect(s.map((x) => x.id)).toContain("weekend:steps");
    expect(s.find((x) => x.id === "weekend:steps")!.text).toBe("Steps: missed 4/4 weekend days vs 0/10 weekdays.");
  });

  it("finds a missing breakfast and the light-protein meal", () => {
    const r = records(() => ({ meals: [["lunch", 900, 40, "13:00"], ["snack", 300, 10, "17:00"], ["dinner", 900, 50, "20:30"]], workout: true }));
    const ids = findSignals(r, targets).map((x) => x.id);
    expect(ids).toContain("meals:slot:breakfast");
    expect(ids).toContain("protein:short");
  });

  it("links late meals to going over", () => {
    const r = records((i) => ({
      workout: true,
      meals: i % 2 ? [...goodDay.slice(0, 2), ["dinner", 1400, 60, "22:45"]] : goodDay,
    }));
    const s = findSignals(r, targets);
    expect(s.find((x) => x.id === "cal:late")?.text).toBe("On days with a meal after 10 pm you went over 100% of the time, vs 0% otherwise.");
  });

  it("collects skip reasons", () => {
    const r = records((_, wd) => ({ meals: goodDay, workout: false, skip: wd === 1 ? "work ran late" : wd === 3 ? "tired" : undefined }));
    expect(findSignals(r, targets).find((x) => x.id === "workout:reasons")!.text).toContain("work ran late (2)");
  });

  it("is empty when every day is on track", () => {
    expect(findSignals(records(() => ({ meals: goodDay, workout: true })), targets)).toEqual([]);
  });
});

describe("experimentOutcome", () => {
  it("calls it helped when the check's hit rate rises 15+ points", () => {
    const after = records(() => ({ meals: goodDay, workout: true }));
    expect(experimentOutcome(0.4, after.slice(0, 7), "steps")).toMatchObject({ verdict: "helped", before: 0.4, after: 1 });
  });
  it("waits for 4 days of data", () => {
    expect(experimentOutcome(0.4, records(() => ({})).slice(0, 3), "steps").verdict).toBe("too_early");
  });
  it("hit rate counts only days the check applies to", () => {
    const r = records(() => ({ meals: goodDay, workout: false }));
    expect(checkHitRate(r, "workout")).toMatchObject({ hit: 0, of: 6 });
  });
});

describe("rcaDue", () => {
  const now = new Date("2026-11-01T04:00:00Z");
  const base = { localDate: "2026-11-01", now, lastStreakReportAt: null, lastWeeklyReportAt: null };
  it("runs the weekly review on Sunday evening once", () => {
    expect(rcaDue({ ...base, weekday: 0, localHour: 18.5, lastTwoDaysOffTrack: false })).toBe("weekly_review");
    expect(rcaDue({ ...base, weekday: 0, localHour: 18.5, lastTwoDaysOffTrack: false, lastWeeklyReportAt: new Date(now.getTime() - 3600_000) })).toBeNull();
  });
  it("runs after two off days, at most every 4 days", () => {
    expect(rcaDue({ ...base, weekday: 3, localHour: 9.2, lastTwoDaysOffTrack: true })).toBe("off_track_streak");
    expect(rcaDue({ ...base, weekday: 3, localHour: 8, lastTwoDaysOffTrack: true })).toBeNull();
    expect(rcaDue({ ...base, weekday: 3, localHour: 10, lastTwoDaysOffTrack: true, lastStreakReportAt: new Date(now.getTime() - 2 * 86_400_000) })).toBeNull();
  });
});

describe("writeInsight", () => {
  const signals = [{ id: "weekend:steps", check: "steps" as const, text: "Steps slip at weekends.", weight: 4 }];
  const ctx = { targets, onTrackDays: 6, days: 14, past: [] };

  it("uses the model's tool call", async () => {
    const create = vi.fn(async () => ({
      content: [{ type: "tool_use", id: "t", name: "write_rca", input: { hypothesis: "Weekends have no walking routine.", experiment: "Walk 30 minutes before Saturday and Sunday lunch.", targetCheck: "steps" } }],
    }));
    const r = await writeInsight(signals, ctx, create as never);
    expect(r).toMatchObject({ source: "model", targetCheck: "steps" });
    expect(create.mock.calls[0]![0]).toMatchObject({ tool_choice: { type: "auto" } });
  });

  it("falls back to a deterministic insight when the call fails", async () => {
    const r = await writeInsight(signals, ctx, (async () => { throw new Error("overloaded"); }) as never);
    expect(r).toEqual({ ...fallbackInsight(signals), source: "fallback" });
    expect(r.experiment).toMatch(/walk/i);
  });
});

describe("runRca", () => {
  it("stores evidence, insight and the baseline for the target check", async () => {
    const recs = records((_, wd) => ({ meals: goodDay, workout: true, steps: wd === 0 || wd === 6 ? 3000 : 9500 }));
    const save = vi.fn(async (_u: string, row: Record<string, unknown>) => ({ id: "r1", ...row }) as never);
    const out = await runRca("u1", "manual", new Date("2026-10-26T06:00:00Z"), {
      load: async () => ({ records: recs, targets, timezone: TZ }),
      past: async () => [],
      insight: async () => ({ hypothesis: "h", experiment: "e", targetCheck: "steps", source: "model" }),
      save,
    });
    expect(out).not.toBeNull();
    const row = save.mock.calls[0]![1];
    expect(row).toMatchObject({ trigger: "manual", target_check: "steps", period_start: "2026-10-12", period_end: "2026-10-25" });
    expect(row.baseline_rate).toBeCloseTo(10 / 14);
  });

  it("ignores days before the first meal log (tracking hadn't started)", async () => {
    // Hevy shows workouts all fortnight, but meals only start on day 13.
    const recs = records((i) => ({ workout: true, steps: 9000, meals: i >= 12 ? goodDay : undefined }));
    const save = vi.fn();
    const deps = { load: async () => ({ records: recs, targets, timezone: TZ }), past: async () => [], insight: vi.fn() as never, save };
    expect(await runRca("u1", "weekly_review", new Date(), deps)).toBeNull();
    expect(save).not.toHaveBeenCalled();
    const none = records(() => ({ workout: true, steps: 9000 }));
    expect(await runRca("u1", "manual", new Date(), { ...deps, load: async () => ({ records: none, targets, timezone: TZ }) })).toBeNull();
  });

  it("skips automatic runs when nothing is off", async () => {
    const recs = records(() => ({ meals: goodDay, workout: true }));
    const save = vi.fn();
    const out = await runRca("u1", "off_track_streak", new Date(), {
      load: async () => ({ records: recs, targets, timezone: TZ }),
      past: async () => [],
      insight: vi.fn() as never,
      save,
    });
    expect(out).toBeNull();
    expect(save).not.toHaveBeenCalled();
  });
});
