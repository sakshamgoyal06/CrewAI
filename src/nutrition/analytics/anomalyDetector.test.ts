import { describe, expect, it } from "vitest";

import {
  detectMealAnomalies,
  offsetDateKey,
  type AnomalyDetectorInput,
  type RollupHistoryRow,
} from "./anomalyDetector.js";

function baseInput(overrides: Partial<AnomalyDetectorInput> = {}): AnomalyDetectorInput {
  return {
    localDate: "2026-08-09",
    calories: 1800,
    protein_g: 140,
    mealCount: 3,
    snackCount: 0,
    slotsLogged: ["breakfast", "lunch", "dinner"],
    slotsMissed: [],
    adherenceScore: 1,
    slotsPlannedCount: 3,
    hasUnavailableEstimate: false,
    targetCalories: 2000,
    targetProtein_g: 160,
    recentRollups: [],
    ...overrides,
  };
}

function rollup(
  localDate: string,
  overrides: Partial<RollupHistoryRow> = {},
): RollupHistoryRow {
  return {
    localDate,
    calories: 1800,
    protein_g: 140,
    mealCount: 3,
    snackCount: 0,
    slotsMissed: [],
    flags: [],
    ...overrides,
  };
}

describe("detectMealAnomalies", () => {
  it("flags calorie_spike above 130% of target", () => {
    const flags = detectMealAnomalies(baseInput({ calories: 2700 }));
    expect(flags).toContain("calorie_spike");
  });

  it("flags protein_low when 3-day average is below 70% target", () => {
    const flags = detectMealAnomalies(
      baseInput({
        protein_g: 90,
        recentRollups: [
          rollup("2026-08-07", { protein_g: 90 }),
          rollup("2026-08-08", { protein_g: 95 }),
        ],
      }),
    );
    expect(flags).toContain("protein_low");
  });

  it("flags plan_drift when adherence is low with multiple planned slots", () => {
    const flags = detectMealAnomalies(
      baseInput({
        adherenceScore: 0.25,
        slotsPlannedCount: 3,
        slotsMissed: ["lunch", "dinner"],
      }),
    );
    expect(flags).toContain("plan_drift");
  });

  it("flags logging_gap when today is empty but user logged recently", () => {
    const flags = detectMealAnomalies(
      baseInput({
        calories: 0,
        protein_g: 0,
        mealCount: 0,
        snackCount: 0,
        recentRollups: [
          rollup("2026-08-03", { mealCount: 2 }),
          rollup("2026-08-05", { mealCount: 3 }),
          rollup("2026-08-07", { mealCount: 2 }),
        ],
      }),
    );
    expect(flags).toContain("logging_gap");
  });

  it("flags slot_habitually_missed after repeated misses", () => {
    const flags = detectMealAnomalies(
      baseInput({
        slotsMissed: ["breakfast"],
        recentRollups: [
          rollup("2026-08-02", { slotsMissed: ["breakfast"] }),
          rollup("2026-08-03", { slotsMissed: ["breakfast"] }),
          rollup("2026-08-04", { slotsMissed: ["breakfast"] }),
          rollup("2026-08-05", { slotsMissed: ["breakfast"] }),
          rollup("2026-08-06", { slotsMissed: ["breakfast"] }),
        ],
      }),
    );
    expect(flags).toContain("slot_habitually_missed");
  });

  it("flags estimate_unavailable", () => {
    const flags = detectMealAnomalies(baseInput({ hasUnavailableEstimate: true }));
    expect(flags).toContain("estimate_unavailable");
  });
});

describe("offsetDateKey", () => {
  it("offsets calendar dates", () => {
    expect(offsetDateKey("2026-08-09", -1)).toBe("2026-08-08");
    expect(offsetDateKey("2026-08-01", -1)).toBe("2026-07-31");
  });
});
