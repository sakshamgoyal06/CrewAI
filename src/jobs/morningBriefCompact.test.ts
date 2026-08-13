import { describe, expect, it } from "vitest";

import { buildCompactMorningBriefPayload } from "./morningBriefCompact.js";
import type { MorningBriefContextBundle } from "./morningBriefContext.js";

function baseBundle(overrides: Partial<MorningBriefContextBundle> = {}): MorningBriefContextBundle {
  return {
    nowIso: "2026-08-12T02:30:00.000Z",
    timeZone: "UTC",
    northStarGoal: "Build with intention",
    displayName: "Alex",
    goals: [{ timeframe: "weekly", title: "Ship v1" }],
    pillarStatus: [],
    happinessReserve: null,
    kpiReadings: [],
    magnusInsights: [],
    dailyPlans: [],
    magnusDailyLogs: [],
    patternRows: [],
    events: [
      {
        title: "Gym",
        status: "planned",
        planned_start_at: "2026-08-12T18:00:00.000Z",
      },
      {
        title: "Standup",
        status: "missed",
        planned_start_at: "2026-08-11T09:00:00.000Z",
      },
    ],
    eventActivityStats: [],
    nutritionBrief: {
      yesterdayCalories: 1900,
      yesterdayProtein: 120,
      yesterdayTargetCalories: 2000,
      todayPlannedMeals: [
        { slot: "breakfast", title: "Oats", status: "planned" },
        { slot: "lunch", title: "Dal rice", status: "planned" },
      ],
      caloriesSoFarToday: 0,
    },
    dataAvailability: {
      goals: true,
      pillarStatus: false,
      happinessReserve: false,
      kpiReadings: false,
      patterns: false,
      dailyPlans: false,
      magnusInsights: false,
    },
    weekPriorities: "1. Ship PR\n2. Gym 4x",
    hasMorningIntentionToday: false,
    ...overrides,
  };
}

describe("buildCompactMorningBriefPayload", () => {
  it("extracts focus, plan, meals, and heads-up only", () => {
    const payload = buildCompactMorningBriefPayload(baseBundle());
    expect(payload.northStar).toBe("Build with intention");
    expect(payload.weekPriorities).toContain("Ship PR");
    expect(payload.weeklyGoals).toEqual(["Ship v1"]);
    expect(payload.todayCommitments).toHaveLength(1);
    expect(payload.todayCommitments[0]?.title).toBe("Gym");
    expect(payload.todayMeals).toHaveLength(2);
    expect(payload.headsUp.some((h) => h.includes("Standup"))).toBe(true);
    expect(payload.hasMorningIntentionToday).toBe(false);
  });

  it("omits meals when nutrition brief is null", () => {
    const payload = buildCompactMorningBriefPayload(
      baseBundle({ nutritionBrief: null }),
    );
    expect(payload.todayMeals).toEqual([]);
  });
});
