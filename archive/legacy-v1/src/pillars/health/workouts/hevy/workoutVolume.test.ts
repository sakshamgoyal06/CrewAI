import { describe, expect, it } from "vitest";

import {
  computeLatestSessionVolumeKg,
  computeWorkoutVolumeKg,
  setTonnageKg,
} from "./workoutVolume.js";
import type { HevyWorkout } from "./types.js";

describe("workoutVolume", () => {
  it("sums weight × reps for working sets only", () => {
    const workout: HevyWorkout = {
      title: "Push",
      exercises: [
        {
          title: "Bench",
          sets: [
            { type: "warmup", weight_kg: 40, reps: 10 },
            { type: "normal", weight_kg: 60, reps: 8 },
            { type: "normal", weight_kg: 60, reps: 6 },
          ],
        },
      ],
    };
    expect(computeWorkoutVolumeKg(workout)).toBe(60 * 8 + 60 * 6);
  });

  it("returns null when latest workout has no tonnage", () => {
    expect(
      computeLatestSessionVolumeKg([
        { title: "Run", exercises: [{ title: "Treadmill", sets: [{ duration_seconds: 900 }] }] },
      ]),
    ).toBeNull();
  });

  it("setTonnageKg ignores missing weight or reps", () => {
    expect(setTonnageKg({ type: "normal", reps: 10 })).toBe(0);
    expect(setTonnageKg({ type: "normal", weight_kg: 50 })).toBe(0);
  });
});
