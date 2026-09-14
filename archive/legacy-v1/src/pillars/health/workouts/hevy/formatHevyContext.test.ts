import { describe, expect, it } from "vitest";

import {
  DEFAULT_HEVY_WORKOUT_CONTEXT_MAX_CHARS,
  formatHevyRoutinesForPrompt,
  formatHevyWorkoutsForPrompt,
} from "./formatHevyContext.js";
import type { HevyWorkout } from "./types.js";

describe("formatHevyWorkoutsForPrompt", () => {
  it("includes date, title, workout id, and per-set detail", () => {
    const workouts: HevyWorkout[] = [
      {
        id: "abc-123",
        start_time: "2026-04-10T08:00:00Z",
        title: "Push",
        exercises: [
          {
            title: "Bench Press (Barbell)",
            sets: [
              { weight_kg: 60, reps: 10 },
              { weight_kg: 65, reps: 8 },
            ],
          },
          { title: "Tricep Pushdown", sets: [{ weight_kg: 25, reps: 12 }] },
        ],
      },
    ];
    const s = formatHevyWorkoutsForPrompt(workouts);
    expect(s).toContain("2026-04-10");
    expect(s).toContain("Push");
    expect(s).toContain("[abc-123]");
    expect(s).toContain("Bench Press (Barbell): 60×10, 65×8");
    expect(s).toContain("Tricep Pushdown: 25×12");
    expect(s).not.toContain("(2 sets)");
  });

  it("formats duration-based sets for cardio", () => {
    const workouts: HevyWorkout[] = [
      {
        title: "Cardio",
        start_time: "2026-04-11T09:00:00Z",
        exercises: [{ title: "Treadmill", sets: [{ duration_seconds: 420 }] }],
      },
    ];
    expect(formatHevyWorkoutsForPrompt(workouts)).toContain("Treadmill: 7 min");
  });

  it("includes every exercise (no headline cap)", () => {
    const exercises = Array.from({ length: 6 }, (_, i) => ({
      title: `Exercise ${i + 1}`,
      sets: [{ weight_kg: 10, reps: 10 }],
    }));
    const s = formatHevyWorkoutsForPrompt([
      { title: "Full", start_time: "2026-04-12T09:00:00Z", exercises },
    ]);
    expect(s).toContain("Exercise 1: 10×10");
    expect(s).toContain("Exercise 6: 10×10");
    expect(s).not.toContain("+2 more");
  });

  it("truncates at maxChars without splitting mid-workout when possible", () => {
    const huge = "x".repeat(DEFAULT_HEVY_WORKOUT_CONTEXT_MAX_CHARS + 500);
    const workouts: HevyWorkout[] = [
      {
        title: "A",
        start_time: "2026-04-01T09:00:00Z",
        exercises: [{ title: huge, sets: [{ reps: 1 }] }],
      },
      {
        title: "B",
        start_time: "2026-03-31T09:00:00Z",
        exercises: [{ title: "Later", sets: [{ reps: 1 }] }],
      },
    ];
    const s = formatHevyWorkoutsForPrompt(workouts, { maxChars: 500 });
    expect(s.length).toBeLessThanOrEqual(520);
    expect(s).toContain("truncated");
  });
});

describe("formatHevyRoutinesForPrompt", () => {
  it("lists routine titles", () => {
    expect(formatHevyRoutinesForPrompt([{ title: "Legs A" }, { title: "Upper B" }])).toContain(
      "Legs A; Upper B",
    );
  });
});
