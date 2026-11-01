import { describe, expect, it, vi } from "vitest";

vi.mock("../tools/clients.js", () => ({ supabase: {}, redis: {}, anthropic: {} }));

import type { HevyWorkout } from "../pillars/health/workouts/hevy/index.js";
import { analyzeTraining, describeSets, estimateOneRepMax, searchTemplates, workoutReview } from "./training.js";

const TZ = "UTC";
const NOW = new Date("2026-10-28T12:00:00Z");

function w(date: string, exercises: Array<[string, string, Array<[number, number] | [number, number, string]>]>): HevyWorkout {
  return {
    id: `w-${date}`,
    title: "Session",
    start_time: `${date}T18:00:00Z`,
    end_time: `${date}T19:00:00Z`,
    exercises: exercises.map(([id, title, sets]) => ({
      exercise_template_id: id,
      title,
      sets: sets.map(([kg, reps, type]) => ({ weight_kg: kg, reps, type: type ?? "normal" })),
    })),
  };
}

describe("estimateOneRepMax", () => {
  it("uses Epley and caps reps at 12", () => {
    expect(estimateOneRepMax(100, 1)).toBe(100);
    expect(estimateOneRepMax(100, 5)).toBeCloseTo(116.67, 1);
    expect(estimateOneRepMax(50, 20)).toBe(estimateOneRepMax(50, 12));
    expect(estimateOneRepMax(0, 10)).toBe(0);
  });
});

describe("analyzeTraining", () => {
  const history = [
    w("2026-09-07", [["bench", "Bench Press", [[60, 10, "warmup"], [80, 5], [80, 5]]], ["lat", "Lateral Raise", [[10, 12]]]]),
    w("2026-09-14", [["bench", "Bench Press", [[80, 6]]], ["lat", "Lateral Raise", [[10, 12]]]]),
    w("2026-09-28", [["bench", "Bench Press", [[82.5, 5]]], ["lat", "Lateral Raise", [[10, 12]]]]),
    w("2026-10-12", [["bench", "Bench Press", [[85, 5]]], ["lat", "Lateral Raise", [[10, 11]]], ["ohp", "Overhead Press", [[50, 5]]]]),
    w("2026-10-26", [["bench", "Bench Press", [[85, 6]]], ["lat", "Lateral Raise", [[10, 12]]]]),
    w("2026-07-01", [["bench", "Bench Press", [[200, 1]]]]), // outside the 8-week window
  ];
  const a = analyzeTraining(history, NOW, TZ, 8);

  it("counts only workouts inside the window", () => {
    expect(a.workouts).toBe(5);
    expect(a.workoutsPerWeek).toBe(0.6);
    expect(a.avgDurationMin).toBe(60);
  });

  it("marks a rising lift as progressing and a flat one as stalled", () => {
    const bench = a.exercises.find((e) => e.title === "Bench Press")!;
    expect(bench.trend).toBe("progressing");
    expect(bench.lastTopSet).toBe("85 kg × 6");
    expect(bench.sessions).toBe(5);
    const lat = a.exercises.find((e) => e.title === "Lateral Raise")!;
    expect(lat.trend).toBe("stalled");
    expect(a.stalled).toEqual(["Lateral Raise"]);
    expect(a.progressing).toEqual(["Bench Press"]);
  });

  it("calls a lift with too few sessions new", () => {
    expect(a.exercises.find((e) => e.title === "Overhead Press")!.trend).toBe("new");
  });

  it("ignores warm-up sets for volume and set counts", () => {
    const first = a.weeklyVolumeKg[0]!;
    expect(first.volumeKg).toBe(80 * 5 * 2 + 10 * 12);
  });

  it("flags a regressing lift", () => {
    const r = analyzeTraining(
      [
        w("2026-09-20", [["sq", "Squat", [[120, 5]]]]),
        w("2026-10-01", [["sq", "Squat", [[120, 5]]]]),
        w("2026-10-15", [["sq", "Squat", [[110, 5]]]]),
        w("2026-10-25", [["sq", "Squat", [[110, 4]]]]),
      ],
      NOW,
      TZ,
    );
    expect(r.regressing).toEqual(["Squat"]);
  });
});

describe("workoutReview", () => {
  it("names a new best and stalled lifts from that session", () => {
    const history = [
      w("2026-09-07", [["bench", "Bench Press", [[80, 5]]], ["lat", "Lateral Raise", [[10, 12]]]]),
      w("2026-09-21", [["bench", "Bench Press", [[80, 5]]], ["lat", "Lateral Raise", [[10, 12]]]]),
      w("2026-10-05", [["bench", "Bench Press", [[80, 5]]], ["lat", "Lateral Raise", [[10, 12]]]]),
      w("2026-10-27", [["bench", "Bench Press", [[82.5, 5]]], ["lat", "Lateral Raise", [[10, 12]]]]),
    ];
    const a = analyzeTraining(history, NOW, TZ);
    const text = workoutReview({ title: "Push A", durationMin: 62, exerciseCount: 2 }, "2026-10-27", a)!;
    expect(text).toContain("Push A is in Hevy (62 min).");
    expect(text).toContain("New best: Bench Press 82.5 kg × 5.");
    expect(text).toContain("Lateral Raise");
  });

  it("stays quiet when nothing stands out", () => {
    const a = analyzeTraining([w("2026-10-27", [["bench", "Bench Press", [[80, 5]]]])], NOW, TZ);
    expect(workoutReview({ title: "Push", durationMin: 60, exerciseCount: 1 }, "2026-10-27", a)).toBeNull();
  });
});

describe("describeSets", () => {
  it("collapses identical sets and keeps warm-ups separate", () => {
    expect(describeSets([{ type: "warmup", reps: 10 }, { reps: 8, weight_kg: 60 }, { reps: 8, weight_kg: 60 }])).toBe(
      "1 warm-up + 2 × 8 @ 60 kg",
    );
    expect(describeSets([{ rep_range: { start: 10, end: 15 } }, { rep_range: { start: 10, end: 15 } }])).toBe("2 × 10–15");
  });
});

describe("searchTemplates", () => {
  const cat = [
    { id: "1", title: "Bench Press (Barbell)" },
    { id: "2", title: "Incline Bench Press (Dumbbell)" },
    { id: "3", title: "Lateral Raise (Cable)" },
    { id: "4", title: "Lateral Raise (Dumbbell)" },
  ];
  it("ranks by word overlap", () => {
    expect(searchTemplates("incline dumbbell bench", cat)[0]!.id).toBe("2");
    expect(searchTemplates("cable lateral raise", cat)[0]!.id).toBe("3");
    expect(searchTemplates("squat", cat)).toEqual([]);
  });
});
