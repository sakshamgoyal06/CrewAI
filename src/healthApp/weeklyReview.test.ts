import { describe, expect, it, vi } from "vitest";

vi.mock("../tools/clients.js", () => ({ supabase: {}, anthropic: {} }));

import type { HistoryDay } from "./history.js";
import type { HealthTargets } from "./northStar.js";
import { summarizeWeek } from "./weeklyReview.js";

const targets: HealthTargets = { calorieTarget: 2000, proteinTarget: 140, stepTarget: 8000, trainingDays: [1, 3, 5], minMealSessions: 3 };

function day(i: number, o: Partial<HistoryDay> & { proteinMet?: boolean } = {}): HistoryDay {
  const date = `2026-10-${String(20 + i).padStart(2, "0")}`;
  const proteinMet = o.proteinMet ?? true;
  return {
    date,
    weekday: (2 + i) % 7,
    isTrainingDay: false,
    onTrack: proteinMet,
    score: proteinMet ? 90 : 60,
    checks: [
      { id: "protein", label: "Protein", met: proteinMet, progress: 1, detail: "" },
      { id: "steps", label: "Steps", met: true, progress: 1, detail: "" },
    ],
    calories: 1900,
    proteinG: proteinMet ? 145 : 90,
    carbsG: 0,
    fatG: 0,
    meals: [{ mealSessionId: "m", slot: "lunch", text: "x", loggedAt: "", items: [], name: "x", calories: 1900, proteinG: 145, carbsG: 0, fatG: 0 }],
    steps: 9000,
    walkMinutes: null,
    distanceM: null,
    burn: null,
    workouts: [],
    trainedUnlogged: false,
    ...o,
  };
}

describe("summarizeWeek", () => {
  it("compares with the previous week and picks the most-missed check as next week's focus", () => {
    const prev = Array.from({ length: 7 }, (_, i) => day(i, { proteinMet: i < 2 }));
    const week = Array.from({ length: 7 }, (_, i) => day(i + 7, { proteinMet: i < 4 }));
    const r = summarizeWeek([...prev, ...week], targets, null);
    expect(r.week.onTrackDays).toBe(4);
    expect(r.previous!.onTrackDays).toBe(2);
    expect(r.headline).toMatch(/4 of 7 days on track, up from last week/);
    expect(r.mostMissed).toEqual({ id: "protein", label: "Protein", missedDays: 3 });
    expect(r.focus).toMatch(/protein/i);
    expect(r.week.avgSteps).toBe(9000);
    expect(r.days).toHaveLength(7);
  });

  it("praises a week that meets the goal and handles an empty week", () => {
    const good = Array.from({ length: 7 }, (_, i) => day(i));
    expect(summarizeWeek(good, targets, null).headline).toMatch(/^7 of 7 days on track/);
    const empty = Array.from({ length: 7 }, (_, i) => day(i, { meals: [], onTrack: false, score: 0 }));
    const r = summarizeWeek(empty, targets, null);
    expect(r.week.avgCalories).toBeNull();
    expect(r.headline).toMatch(/Nothing logged/);
    expect(r.bestDay).toBeNull();
  });
});
