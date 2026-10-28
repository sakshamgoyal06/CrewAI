import { describe, expect, it, vi } from "vitest";

vi.mock("../tools/clients.js", () => ({ supabase: {}, redis: {}, anthropic: {} }));

import { summarizeWorkout, weekdayOfDate, windowDates } from "./snapshot.js";

describe("windowDates", () => {
  it("returns seven local dates ending today", () => {
    const dates = windowDates(new Date("2026-10-27T20:00:00Z"), "Asia/Kolkata");
    expect(dates).toHaveLength(7);
    expect(dates[0]).toBe("2026-10-22");
    expect(dates[6]).toBe("2026-10-28");
  });
});

describe("weekdayOfDate", () => {
  it("maps a date string to 0 = Sunday", () => {
    expect(weekdayOfDate("2026-10-25")).toBe(0);
    expect(weekdayOfDate("2026-10-27")).toBe(2);
  });
});

describe("summarizeWorkout", () => {
  it("uses the user's local date and computes duration", () => {
    const w = summarizeWorkout(
      {
        id: "w1",
        title: "Push",
        start_time: "2026-10-26T19:00:00Z",
        end_time: "2026-10-26T20:05:00Z",
        exercises: [{}, {}, {}],
      },
      "Asia/Kolkata",
    );
    expect(w).toEqual({
      id: "w1",
      title: "Push",
      localDate: "2026-10-27",
      startTime: "2026-10-26T19:00:00Z",
      durationMin: 65,
      exerciseCount: 3,
    });
  });

  it("skips workouts without a start time", () => {
    expect(summarizeWorkout({ title: "x" }, "UTC")).toBeNull();
  });
});
