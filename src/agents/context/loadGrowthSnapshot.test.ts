import { describe, expect, it } from "vitest";

import {
  buildBehaviorNarrative,
  computeShowUpRate,
  isLateEveningHour,
} from "./loadGrowthSnapshot.js";

describe("loadGrowthSnapshot helpers", () => {
  it("buildBehaviorNarrative merges issues, wins, logs, and facts", () => {
    const bullets = buildBehaviorNarrative({
      recentIssues: ["Post-gap treadmill — 7 min only"],
      recentWins: ["Push A return"],
      dailyLogSnippets: [
        { date: "2026-08-17", snippet: "Feeling tired since 3 days" },
        { date: "2026-08-16", snippet: "Loved watching a new movie yesterday" },
      ],
      semanticFacts: ["User avoids lauki"],
    });

    expect(bullets.some((b) => b.startsWith("Watch:"))).toBe(true);
    expect(bullets.some((b) => b.startsWith("Win:"))).toBe(true);
    expect(bullets.some((b) => b.includes("Feeling tired"))).toBe(true);
    expect(bullets.some((b) => b.includes("movie"))).toBe(true);
    expect(bullets.length).toBeLessThanOrEqual(8);
  });

  it("computeShowUpRate returns rounded percentage", () => {
    expect(computeShowUpRate(3, 10)).toBe(30);
    expect(computeShowUpRate(0, 0)).toBeUndefined();
  });

  it("isLateEveningHour is true from 21:00", () => {
    expect(isLateEveningHour(20)).toBe(false);
    expect(isLateEveningHour(21)).toBe(true);
    expect(isLateEveningHour(23)).toBe(true);
  });
});
