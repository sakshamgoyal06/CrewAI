import { describe, expect, it, vi } from "vitest";

vi.mock("../tools/clients.js", () => ({ supabase: {}, redis: {}, anthropic: {} }));

import type { BodyCheckin, HealthGoal } from "./goalProgress.js";
import { reviewCalorieTarget, type IntakeDay } from "./calorieTarget.js";

const TODAY = "2026-11-02";
const day = (offset: number): string => new Date(Date.parse(`${TODAY}T00:00:00Z`) + offset * 86_400_000).toISOString().slice(0, 10);

/** `n` days before today, each with `kcal` over 3 meals. */
function intake(n: number, kcal: number, meals = 3): IntakeDay[] {
  return Array.from({ length: n }, (_, i) => ({ date: day(-(i + 1)), calories: kcal, meals }));
}

/** Weekly weigh-ins over the last 4 weeks on a straight line ending at `end` kg. */
function weighIns(end: number, perWeek: number, count = 5): BodyCheckin[] {
  return Array.from({ length: count }, (_, i) => {
    const weeksAgo = count - 1 - i;
    return { localDate: day(-weeksAgo * 7), weight_kg: end - perWeek * weeksAgo, body_fat_pct: null, muscle_mass_kg: null };
  });
}

const goal = (target: number, deadline: string): HealthGoal => ({ id: "g", startDate: day(-60), deadline, targets: { weight_kg: target } });

describe("reviewCalorieTarget", () => {
  it("works out maintenance from intake and the weight trend", () => {
    // 2,000 kcal a day while losing 0.5 kg/week → 550 kcal/day deficit → maintenance ≈ 2,550.
    const r = reviewCalorieTarget({ today: TODAY, intake: intake(24, 2000), checkins: weighIns(80, -0.5), goal: null, currentTarget: 2000 });
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.maintenanceKcal).toBe(2550);
    expect(r.actualKgPerWeek).toBeCloseTo(-0.5, 2);
    expect(r.confidence).toBe("high");
    // No weight goal → hold weight at maintenance.
    expect(r.suggestedTarget).toBe(2550);
    expect(r.recommend).toBe(true);
    expect(r.summary).toContain("maintenance is about 2,550 kcal");
  });

  it("sets the target for the pace the deadline needs", () => {
    // Maintenance 2,550; 80 → 76 kg in 10 weeks = −0.4 kg/week = −440 kcal/day → 2,110 → 2,100.
    const r = reviewCalorieTarget({ today: TODAY, intake: intake(24, 2000), checkins: weighIns(80, -0.5), goal: goal(76, day(70)), currentTarget: 2000 });
    if (r.status !== "ok") throw new Error("expected ok");
    expect(r.neededKgPerWeek).toBeCloseTo(-0.4, 2);
    expect(r.suggestedTarget).toBe(2100);
    expect(r.change).toBe(100);
    expect(r.cappedForSafety).toBe(false);
  });

  it("caps an unsafe deadline and gives the date a safe pace gets there", () => {
    // 80 → 70 kg in 5 weeks needs −2 kg/week; the cap is 1% (0.8 kg/week) and 1,000 kcal/day.
    const r = reviewCalorieTarget({ today: TODAY, intake: intake(24, 2000), checkins: weighIns(80, -0.5), goal: goal(70, day(35)), currentTarget: 2000 });
    if (r.status !== "ok") throw new Error("expected ok");
    expect(r.cappedForSafety).toBe(true);
    expect(r.plannedKgPerWeek).toBeGreaterThanOrEqual(-0.81);
    expect(r.suggestedTarget).toBeGreaterThanOrEqual(2550 - 1000);
    expect(r.safeDate! > day(35)).toBe(true);
    expect(r.summary).toContain("faster pace than is safe");
  });

  it("doesn't offer a change under 100 kcal", () => {
    const r = reviewCalorieTarget({ today: TODAY, intake: intake(24, 2000), checkins: weighIns(80, -0.5), goal: null, currentTarget: 2500 });
    if (r.status !== "ok") throw new Error("expected ok");
    expect(r.change).toBe(50);
    expect(r.recommend).toBe(false);
    expect(r.summary).toContain("is right to hold your weight");
  });

  it("ignores half-logged days and today", () => {
    const days = [...intake(10, 2000), ...intake(10, 600, 1).map((d, i) => ({ ...d, date: day(-(11 + i)) })), { date: TODAY, calories: 300, meals: 1 }];
    const r = reviewCalorieTarget({ today: TODAY, intake: days, checkins: weighIns(80, 0), goal: null, currentTarget: null });
    if (r.status !== "ok") throw new Error("expected ok");
    expect(r.loggedDays).toBe(10);
    expect(r.avgIntakeKcal).toBe(2000);
    expect(r.recommend).toBe(true);
  });

  it("asks for more data before guessing", () => {
    const few = reviewCalorieTarget({ today: TODAY, intake: intake(4, 2000), checkins: weighIns(80, -0.5), goal: null, currentTarget: 2000 });
    expect(few).toMatchObject({ status: "not_enough_data", loggedDays: 4 });
    expect(few.summary).toContain("3 more fully logged days");
    const close = reviewCalorieTarget({ today: TODAY, intake: intake(20, 2000), checkins: weighIns(80, -0.5, 2).map((c, i) => ({ ...c, localDate: day(-i * 3) })), goal: null, currentTarget: 2000 });
    expect(close.status).toBe("not_enough_data");
    expect(close.summary).toContain("weigh-ins at least 10 days apart");
  });

  it("never suggests below the floor", () => {
    const r = reviewCalorieTarget({ today: TODAY, intake: intake(24, 1300), checkins: weighIns(55, 0), goal: goal(45, day(30)), currentTarget: 1300 });
    if (r.status !== "ok") throw new Error("expected ok");
    expect(r.suggestedTarget).toBeGreaterThanOrEqual(1200);
  });
});
