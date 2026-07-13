import { describe, expect, it } from "vitest";

import { formatHevyRoutinesForPrompt, formatHevyWorkoutsForPrompt } from "./formatHevyContext.js";
import type { HevyWorkout } from "./types.js";

describe("formatHevyWorkoutsForPrompt", () => {
  it("includes date, title, and exercise headlines", () => {
    const workouts: HevyWorkout[] = [
      {
        start_time: "2026-04-10T08:00:00Z",
        title: "Push",
        exercises: [
          { title: "Bench Press (Barbell)", sets: [{}, {}] },
          { title: "Tricep Pushdown", sets: [{}] },
        ],
      },
    ];
    const s = formatHevyWorkoutsForPrompt(workouts);
    expect(s).toContain("2026-04-10");
    expect(s).toContain("Push");
    expect(s).toContain("Bench Press (Barbell) (2 sets)");
  });
});

describe("formatHevyRoutinesForPrompt", () => {
  it("lists routine titles", () => {
    expect(formatHevyRoutinesForPrompt([{ title: "Legs A" }, { title: "Upper B" }])).toContain(
      "Legs A; Upper B",
    );
  });
});
