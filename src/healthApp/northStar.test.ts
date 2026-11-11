import { describe, expect, it } from "vitest";

import { computeNorthStar, scoreDay, type DayInputs, type HealthTargets } from "./northStar.js";

const targets: HealthTargets = {
  calorieTarget: 2200,
  proteinTarget: 150,
  stepTarget: 8000,
  trainingDays: [1, 3, 5],
  minMealSessions: 3,
};

function day(over: Partial<DayInputs> = {}): DayInputs {
  return {
    date: "2026-10-26",
    weekday: 1,
    mealSessions: 3,
    calories: 2000,
    proteinG: 160,
    steps: 9000,
    workoutsLogged: 1,
    ...over,
  };
}

describe("scoreDay", () => {
  it("is on-track when every applicable check is met", () => {
    const s = scoreDay(day(), targets);
    expect(s.onTrack).toBe(true);
    expect(s.score).toBe(100);
    expect(s.checks.map((c) => c.id)).toEqual(["meals_logged", "calories", "protein", "steps", "workout"]);
  });

  it("skips the workout check on rest days", () => {
    const s = scoreDay(day({ weekday: 2, workoutsLogged: 0 }), targets);
    expect(s.checks.some((c) => c.id === "workout")).toBe(false);
    expect(s.onTrack).toBe(true);
  });

  it("misses a training day with no workout", () => {
    const s = scoreDay(day({ workoutsLogged: 0 }), targets);
    expect(s.onTrack).toBe(false);
    expect(s.score).toBe(80);
  });

  it("treats far-under-target calories as under-logging, not success", () => {
    const s = scoreDay(day({ calories: 900 }), targets);
    expect(s.checks.find((c) => c.id === "calories")?.met).toBe(false);
  });

  it("misses calories when over target", () => {
    const s = scoreDay(day({ calories: 2750 }), targets);
    const c = s.checks.find((x) => x.id === "calories")!;
    expect(c.met).toBe(false);
    expect(c.progress).toBeCloseTo(0.8, 2);
  });

  it("drops calorie and protein checks when no targets are set", () => {
    const s = scoreDay(day(), { ...targets, calorieTarget: null, proteinTarget: null });
    expect(s.checks.map((c) => c.id)).toEqual(["meals_logged", "steps", "workout"]);
  });
});

describe("computeNorthStar", () => {
  it("counts on-track days and finds the most missed check, ignoring today's misses", () => {
    const days = [
      scoreDay(day({ steps: 3000 }), targets),
      scoreDay(day({ steps: 4000, mealSessions: 1 }), targets),
      scoreDay(day(), targets),
      scoreDay(day({ mealSessions: 0, steps: 0, calories: 0, proteinG: 0, workoutsLogged: 0 }), targets),
    ];
    const ns = computeNorthStar(days);
    expect(ns.onTrackDays).toBe(1);
    expect(ns.windowDays).toBe(4);
    expect(ns.mostMissed).toEqual({ id: "steps", label: "Steps", missedDays: 2 });
  });
});

describe("food rule from 2026-11-05: calories and macros, not meal count", () => {
  const t: HealthTargets = { calorieTarget: 2000, proteinTarget: 150, stepTarget: 8000, trainingDays: [], minMealSessions: 3, weightKg: 80 };
  // macroTargets(2000 kcal, 150 g protein, 80 kg): fat 62 g, carbs 211 g.
  const day = (over: Partial<DayInputs> = {}): DayInputs => ({
    date: "2026-11-05", weekday: 4, mealSessions: 1, calories: 2000, proteinG: 150, carbsG: 211, fatG: 62, steps: 9000, workoutsLogged: 0, ...over,
  });
  const check = (d: DayInputs, id: string) => scoreDay(d, t).checks.find((c) => c.id === id);

  it("has no meals-logged check: two big meals can be on track", () => {
    expect(check(day(), "meals_logged")).toBeUndefined();
    expect(scoreDay(day(), t).onTrack).toBe(true);
  });
  it("wants calories at 85–105% of target", () => {
    expect(check(day({ calories: 1700 }), "calories")?.met).toBe(true);
    expect(check(day({ calories: 1690 }), "calories")?.met).toBe(false);
    expect(check(day({ calories: 2100 }), "calories")?.met).toBe(true);
    expect(check(day({ calories: 2110 }), "calories")?.met).toBe(false);
  });
  it("wants at least 90% of protein", () => {
    expect(check(day({ proteinG: 135 }), "protein")?.met).toBe(true);
    expect(check(day({ proteinG: 134 }), "protein")?.met).toBe(false);
  });
  it("wants carbs and fat each within 25% of target", () => {
    expect(check(day({ fatG: 77 }), "macros")?.met).toBe(true);
    expect(check(day({ fatG: 80 }), "macros")?.met).toBe(false);
    expect(check(day({ carbsG: 150 }), "macros")?.met).toBe(false);
    expect(check(day({ carbsG: undefined }), "macros")).toBeUndefined();
  });
  it("keeps the old rule for earlier days, so past weeks don't change", () => {
    const old = day({ date: "2026-11-04" });
    expect(check(old, "meals_logged")?.met).toBe(false);
    expect(check(old, "macros")).toBeUndefined();
  });
});

describe("an unlogged day is not a missed day", () => {
  const t: HealthTargets = { calorieTarget: 2000, proteinTarget: 150, stepTarget: 8000, trainingDays: [], minMealSessions: 3, weightKg: 80 };
  const blank = day({ date: "2026-11-10", weekday: 2, mealSessions: 0, calories: 0, proteinG: 0, steps: 4800 });
  it("replaces the food checks with one Meals logged check", () => {
    const s = scoreDay(blank, t);
    expect(s.unlogged).toBe(true);
    expect(s.checks.map((c) => c.id)).toEqual(["meals_logged", "steps"]);
    expect(s.checks[0]).toMatchObject({ met: false, detail: "Nothing logged" });
    expect(scoreDay({ ...blank, mealSessions: 1, calories: 400 }, t).unlogged).toBeUndefined();
  });
  it("counts unlogged past days, never as calorie or protein misses", () => {
    const today = day({ date: "2026-11-11", weekday: 3, mealSessions: 0, calories: 0, proteinG: 0 });
    const ns = computeNorthStar([scoreDay(blank, t), scoreDay({ ...blank, date: "2026-11-09" }, t), scoreDay(today, t)]);
    expect(ns.unloggedDays).toBe(2);
    expect(ns.mostMissed?.id).not.toBe("protein");
    expect(ns.mostMissed?.id).not.toBe("calories");
  });
});

describe("logging state (11 Nov rule)", () => {
  const t = { calorieTarget: 2200, proteinTarget: 165, stepTarget: 8000, trainingDays: [], minMealSessions: 3 };
  const base = { date: "2026-11-09", weekday: 1, mealSessions: 1, calories: 120, proteinG: 24, carbsG: 2, fatG: 2, steps: 9000, workoutsLogged: 0 };

  it("a day with a snack logged is partly logged, not a calorie or protein miss", () => {
    const d = scoreDay(base, t);
    expect(d.partial).toBe(true);
    expect(d.unlogged).toBeUndefined();
    expect(d.checks.find((c) => c.id === "protein")!.detail).toMatch(/partly logged/);
    const ns = computeNorthStar([d, d, scoreDay({ ...base, date: "2026-11-11" }, t)]);
    expect(ns.mostMissed).toEqual({ id: "meals_logged", label: "Meals logged", missedDays: 2 });
    expect(ns.partialDays).toBe(2);
  });

  it("skipped meals are a logged zero, not an unlogged day", () => {
    const d = scoreDay({ ...base, mealSessions: 0, calories: 0, proteinG: 0, carbsG: 0, fatG: 0, mealsSkipped: 3 }, t);
    expect(d.unlogged).toBeUndefined();
    expect(d.partial).toBeUndefined();
    expect(d.checks.find((c) => c.id === "calories")!.met).toBe(false);
  });

  it("plan accounting decides when given: every meal accounted for is a full day even if light", () => {
    expect(scoreDay({ ...base, loggedInFull: true }, t).partial).toBeUndefined();
    expect(scoreDay({ ...base, calories: 1900, mealSessions: 3, loggedInFull: false }, t).partial).toBe(true);
  });
});
