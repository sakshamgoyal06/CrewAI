import { describe, expect, it } from "vitest";
import { blankDaysSince, loggingSummary, plannedMealsAccountedFor } from "./loggingStatus.js";
import type { DayScore } from "./northStar.js";

const day = (date: string, extra: Partial<DayScore> = {}): DayScore => ({ date, checks: [], onTrack: false, score: 0, ...extra });

describe("loggingSummary", () => {
  it("counts blank days since the last log and the logged days in the window", () => {
    const days = [day("2026-11-05"), day("2026-11-06"), day("2026-11-07", { partial: true }), day("2026-11-08", { unlogged: true }), day("2026-11-09", { unlogged: true }), day("2026-11-10", { unlogged: true }), day("2026-11-11", { unlogged: true })];
    const s = loggingSummary("2026-11-11", "2026-11-07", days);
    expect(s).toMatchObject({ daysSinceLog: 4, blankDays: 3, loggedDays: 3, windowDays: 6, streak: 0 });
  });

  it("is zero blank days when yesterday was logged, and counts the full-day streak", () => {
    const s = loggingSummary("2026-11-11", "2026-11-10", [day("2026-11-09", { partial: true }), day("2026-11-10"), day("2026-11-11")]);
    expect(s).toMatchObject({ daysSinceLog: 1, blankDays: 0, streak: 1 });
  });

  it("someone who never logged has no last date", () => {
    expect(loggingSummary("2026-11-11", null, [day("2026-11-10", { unlogged: true }), day("2026-11-11")])).toMatchObject({ daysSinceLog: null, blankDays: 0 });
  });
});

describe("paused days (breaks.ts)", () => {
  const paused = (d: string) => d >= "2026-11-08" && d <= "2026-11-09";

  it("are never blank days", () => {
    expect(blankDaysSince("2026-11-06", "2026-11-11")).toBe(4);
    expect(blankDaysSince("2026-11-06", "2026-11-11", paused)).toBe(2);
    expect(blankDaysSince(null, "2026-11-11", paused)).toBe(0);
  });

  it("drop out of the window and don't break the streak or count in the gap", () => {
    const days = [day("2026-11-05", { unlogged: true }), day("2026-11-06", { unlogged: true }), day("2026-11-07"), day("2026-11-08", { paused: true }), day("2026-11-09", { paused: true }), day("2026-11-10"), day("2026-11-11")];
    const s = loggingSummary("2026-11-11", "2026-11-10", days, paused);
    expect(s).toMatchObject({ blankDays: 0, windowDays: 4, loggedDays: 2, streak: 2, gapBefore: 0 });
  });
});

describe("plannedMealsAccountedFor", () => {
  it("needs each planned main meal eaten, logged in its slot or skipped; snacks don't count", () => {
    const planned = [{ slot: "breakfast", status: "logged" }, { slot: "lunch", status: "skipped" }, { slot: "snack", status: "planned" }, { slot: "dinner", status: "planned" }];
    expect(plannedMealsAccountedFor(planned, new Set(["breakfast"]))).toBe(false);
    expect(plannedMealsAccountedFor(planned, new Set(["dinner"]))).toBe(true);
  });
});
