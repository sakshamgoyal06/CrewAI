import { describe, expect, it } from "vitest";

import { computeGoalProgress, energyPace, nextCheckpoint, slopePerDay, weighInDue, type BodyCheckin, type HealthGoal } from "./goalProgress.js";

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

describe("weighInDue", () => {
  // 2026-11-08 is a Sunday (0).
  it("without a chosen day, is due 7 days after the last weigh-in", () => {
    expect(weighInDue(null, "2026-11-04")).toBe(true);
    expect(weighInDue("2026-11-01", "2026-11-07")).toBe(false);
    expect(weighInDue("2026-11-01", "2026-11-08")).toBe(true);
  });
  it("with a chosen day, is due on that weekday", () => {
    expect(weighInDue("2026-11-01", "2026-11-08", 0)).toBe(true);
    // Five days in, but not Sunday yet.
    expect(weighInDue("2026-11-03", "2026-11-07", 0)).toBe(false);
  });
  it("skips the chosen day when they weighed in a day or two before", () => {
    expect(weighInDue("2026-11-07", "2026-11-08", 0)).toBe(false);
    expect(weighInDue("2026-11-05", "2026-11-08", 0)).toBe(true);
  });
  it("catches up the day after a missed weigh-in day", () => {
    expect(weighInDue("2026-11-01", "2026-11-09", 0)).toBe(true);
    expect(weighInDue("2026-11-01", "2026-11-08", 3)).toBe(false);
  });
  it("is threaded through computeGoalProgress", () => {
    const g: HealthGoal = { id: "g", targets: { weight_kg: 80 }, deadline: "2027-01-01", startedOn: "2026-10-01" } as HealthGoal;
    expect(computeGoalProgress(g, [c("2026-11-03", 84)], "2026-11-08", 0).checkinDue).toBe(true);
    expect(computeGoalProgress(g, [c("2026-11-03", 84)], "2026-11-08").checkinDue).toBe(false);
  });
});

describe("nextCheckpoint", () => {
  const base = { start: 90, target: 80, startDate: "2026-11-01", deadline: "2027-01-24" }; // 84 days → 3 checkpoints

  it("puts the first checkpoint 4 weeks out on the line to the goal", () => {
    const c = nextCheckpoint({ ...base, latest: 89, today: "2026-11-05" })!;
    expect(c).toMatchObject({ index: 1, total: 3, date: "2026-11-29", value: 86.7, reached: false, previous: null });
    expect(c.progress).toBeCloseTo(0.303, 2);
  });

  it("moves to the next checkpoint once the date passes, and says whether the last one was hit", () => {
    const c = nextCheckpoint({ ...base, latest: 86.2, today: "2026-12-01" })!;
    expect(c).toMatchObject({ index: 2, date: "2026-12-27", value: 83.3 });
    expect(c.previous).toMatchObject({ index: 1, reached: true });
  });

  it("works for gaining too, and ends at the deadline", () => {
    const c = nextCheckpoint({ start: 60, target: 64, startDate: "2026-11-01", deadline: "2026-12-10", latest: 61, today: "2026-12-05" })!;
    expect(c).toMatchObject({ index: 2, total: 2, date: "2026-12-10", value: 64 });
  });

  it("is null without a start or a real distance", () => {
    expect(nextCheckpoint({ ...base, start: null, latest: 85, today: "2026-11-05" })).toBeNull();
    expect(nextCheckpoint({ ...base, start: 80, latest: 80, today: "2026-11-05" })).toBeNull();
  });
});

describe("energyPace", () => {
  const day = (date: string, calories: number, burnKcal: number | null, full = true) => ({ date, calories, burnKcal, full });

  it("turns the average deficit of fully logged days into kg a week and a landing date", () => {
    const p = energyPace({
      days: [day("2026-11-08", 1800, 2350), day("2026-11-09", 1900, 2450), day("2026-11-10", 1700, 2250), day("2026-11-11", 0, null, false), day("2026-11-12", 600, 900)],
      today: "2026-11-12",
      latestWeightKg: 85,
      targetWeightKg: 80,
    })!;
    expect(p.daysUsed).toBe(3);
    expect(p.kgPerWeek).toBeCloseTo(-0.5, 2);
    expect(p.landsOn).toBe("2027-01-21");
  });

  it("gives no date when intake is heading away from the target", () => {
    const p = energyPace({ days: [day("2026-11-08", 2600, 2300), day("2026-11-09", 2600, 2300), day("2026-11-10", 2600, 2300)], today: "2026-11-12", latestWeightKg: 85, targetWeightKg: 80 })!;
    expect(p.kgPerWeek).toBeGreaterThan(0);
    expect(p.landsOn).toBeNull();
  });

  it("needs at least 3 fully logged past days with a burn", () => {
    expect(energyPace({ days: [day("2026-11-10", 1800, 2300), day("2026-11-11", 1800, 2300, false)], today: "2026-11-12", latestWeightKg: 85, targetWeightKg: 80 })).toBeNull();
  });
});
