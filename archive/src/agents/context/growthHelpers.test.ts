import { describe, expect, it } from "vitest";

import {
  buildBehaviorNarrative,
  buildSlippingRoutines,
  computeShowUpRate,
  inferDayFrameTone,
  inferScheduleDayTone,
  isLateEveningHour,
  projectConsistencyHint,
  routineConsistencyHint,
} from "./growthHelpers.js";

describe("growthHelpers", () => {
  it("computeShowUpRate returns rounded percentage", () => {
    expect(computeShowUpRate(3, 10)).toBe(30);
    expect(computeShowUpRate(0, 0)).toBeUndefined();
  });

  it("isLateEveningHour is true from 21:00", () => {
    expect(isLateEveningHour(20)).toBe(false);
    expect(isLateEveningHour(21)).toBe(true);
  });

  it("inferScheduleDayTone reads weekly_schedule markdown", () => {
    const body = `
## Week
- mon: Push gym
- tue: rest / recovery
`;
    expect(inferScheduleDayTone(body, 1)).toBe("working");
    expect(inferScheduleDayTone(body, 2)).toBe("rest");
  });

  it("inferDayFrameTone respects low energy and intentions", () => {
    expect(
      inferDayFrameTone({
        dayIndex: 1,
        energyLevel: 2,
        openCommitmentCount: 0,
        overdueCount: 0,
      }).tone,
    ).toBe("relaxed");

    expect(
      inferDayFrameTone({
        dayIndex: 1,
        morningIntention: "light day — rest and read",
        openCommitmentCount: 0,
        overdueCount: 0,
      }).tone,
    ).toBe("relaxed");
  });

  it("buildSlippingRoutines merges misses and stats by activity_key", () => {
    const misses = new Map([
      ["gym", { activity: "gym", pillar: "health", misses: 3 }],
    ]);
    const slipping = buildSlippingRoutines({
      recentMissesByKey: misses,
      activityStats: [
        { activity: "gym", pillar: "health", done: 2, missed: 3, total: 5, showUpRate: 40 },
        { activity: "deep_work", pillar: "wisdom", done: 8, missed: 1, total: 9, showUpRate: 89 },
      ],
    });
    expect(slipping[0]?.activityKey).toBe("gym");
    expect(slipping[0]?.recentMisses).toBe(3);
  });

  it("routineConsistencyHint is activity-agnostic", () => {
    const hint = routineConsistencyHint([
      { activityKey: "morning_run", activity: "morning_run", recentMisses: 3, showUpRate: 35, total: 6 },
    ]);
    expect(hint).toContain("morning_run");
    expect(hint).not.toContain("Gym");
  });

  it("projectConsistencyHint surfaces open next steps", () => {
    const hint = projectConsistencyHint([
      { title: "Job search", pillar: "wisdom", status: "active", openChecklistCount: 2 },
    ]);
    expect(hint).toContain("Job search");
  });

  it("buildBehaviorNarrative merges issues, wins, morning notes, and logs", () => {
    const bullets = buildBehaviorNarrative({
      issues: ["Sleep debt stacking"],
      wins: ["Shipped draft"],
      morningNotes: ["Woke up late — adjusted plan"],
      dailyLogSnippets: [{ date: "2026-08-17", snippet: "Feeling tired" }],
      semanticFacts: ["User avoids late caffeine"],
    });
    expect(bullets.some((b) => b.startsWith("Issue:"))).toBe(true);
    expect(bullets.some((b) => b.startsWith("Morning:"))).toBe(true);
  });
});
