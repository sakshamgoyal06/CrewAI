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
