import { describe, expect, it } from "vitest";

import { computeGoalProgress, slopePerDay, type BodyCheckin, type HealthGoal } from "./goalProgress.js";

const goal: HealthGoal = {
  id: "g1",
  startDate: "2026-09-01",
  deadline: "2026-12-29",
  targets: { weight_kg: 78, body_fat_pct: 15 },
};

function c(localDate: string, weight_kg: number | null, body_fat_pct: number | null = null): BodyCheckin {
  return { localDate, weight_kg, body_fat_pct, muscle_mass_kg: null };
}

describe("slopePerDay", () => {
  it("fits a straight line", () => {
    expect(slopePerDay([{ day: 0, value: 90 }, { day: 7, value: 89 }, { day: 14, value: 88 }])).toBeCloseTo(-1 / 7, 5);
  });
  it("needs two points", () => {
    expect(slopePerDay([{ day: 0, value: 90 }])).toBeNull();
  });
});

describe("computeGoalProgress", () => {
  it("reports progress, required vs actual pace, and a projected date", () => {
    const checkins = [
      c("2026-09-01", 88),
      c("2026-10-06", 85.5),
      c("2026-10-13", 85),
      c("2026-10-20", 84.5),
      c("2026-10-27", 84),
    ];
    const p = computeGoalProgress(goal, checkins, "2026-10-27");
    const w = p.metrics.find((m) => m.metric === "weight_kg")!;
    expect(w.start).toBe(88);
    expect(w.latest).toBe(84);
    expect(w.progress).toBe(0.4);
    // 6 kg in 63 days = -0.67 kg/week needed; trend is -0.5 kg/week.
    expect(w.requiredPerWeek).toBeCloseTo(-0.67, 2);
    expect(w.actualPerWeek).toBeCloseTo(-0.5, 2);
    expect(w.pace).toBe("behind");
    expect(w.projectedDate).toBe("2027-01-19");
    expect(p.weeksLeft).toBe(9);
    expect(p.checkinDue).toBe(false);
  });

  it("marks on pace within tolerance and ahead above it", () => {
    const g = { ...goal, targets: { weight_kg: 80 } };
    // Needs 1 kg in 63 days (~0.11 kg/week).
    const ahead = computeGoalProgress(
      g,
      [c("2026-10-13", 82), c("2026-10-20", 81.5), c("2026-10-27", 81)],
      "2026-10-27",
    );
    expect(ahead.metrics[0]!.pace).toBe("ahead");
    const onPace = computeGoalProgress(
      g,
      [c("2026-10-13", 81.22), c("2026-10-20", 81.11), c("2026-10-27", 81)],
      "2026-10-27",
    );
    expect(onPace.metrics[0]!.pace).toBe("on_pace");
  });

  it("handles body fat without a start reading at goal start and missing data", () => {
    const p = computeGoalProgress(goal, [c("2026-10-27", 84, 20)], "2026-10-27");
    const bf = p.metrics.find((m) => m.metric === "body_fat_pct")!;
    expect(bf.latest).toBe(20);
    expect(bf.pace).toBe("not_enough_data");
  });

  it("detects a reached target and a due check-in", () => {
    const p = computeGoalProgress(
      { ...goal, targets: { weight_kg: 85 } },
      [c("2026-09-01", 88), c("2026-10-10", 84.8)],
      "2026-10-27",
    );
    expect(p.metrics[0]!.pace).toBe("reached");
    expect(p.checkinDue).toBe(true);
  });

  it("works for muscle gain (target above start)", () => {
    const p = computeGoalProgress(
      { ...goal, targets: { muscle_mass_kg: 40 } },
      [
        { localDate: "2026-09-01", weight_kg: null, body_fat_pct: null, muscle_mass_kg: 36 },
        { localDate: "2026-10-20", weight_kg: null, body_fat_pct: null, muscle_mass_kg: 37 },
        { localDate: "2026-10-27", weight_kg: null, body_fat_pct: null, muscle_mass_kg: 37.2 },
      ],
      "2026-10-27",
    );
    const m = p.metrics[0]!;
    expect(m.progress).toBeCloseTo(0.3, 2);
    expect(m.requiredPerWeek).toBeGreaterThan(0);
  });
});
