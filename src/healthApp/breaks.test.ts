import { describe, expect, it, vi } from "vitest";

vi.mock("../tools/clients.js", () => ({ supabase: {} }));

const { checkBreak, maxDays, pauseEndMessage, pauseOverLine, planBreakOn, alternativeFor } = await import("./breaks.js");
const { onDate, trainingDayOn, routineDayStatus } = await import("./routine.js");
const { scoreDay, computeNorthStar } = await import("./northStar.js");

const plan = (id: string, start: string, end: string) => ({ id, scope: "plan" as const, itemId: null, reason: "travel" as const, note: null, startDate: start, endDate: end, endedAt: null });

describe("pause limits", () => {
  it("caps the length by scope and reason", () => {
    expect(maxDays("item", "busy")).toBe(14);
    expect(maxDays("plan", "travel")).toBe(21);
    expect(maxDays("plan", "sick")).toBe(30);
    expect(checkBreak({ scope: "plan", reason: "travel", until: "2026-12-05" }, "2026-11-11", [])).toEqual({ ok: false, error: "too_long", max: 21 });
    expect(checkBreak({ scope: "plan", reason: "injured", until: "2026-12-05" }, "2026-11-11", [])).toMatchObject({ ok: true, from: "2026-11-11" });
  });

  it("allows at most 2 whole-plan pauses in 90 days, and no overlaps", () => {
    const two = [plan("a", "2026-09-01", "2026-09-05"), plan("b", "2026-10-01", "2026-10-03")];
    expect(checkBreak({ scope: "plan", reason: "rest", until: "2026-11-13" }, "2026-11-11", two)).toEqual({ ok: false, error: "too_many_plan_breaks" });
    expect(checkBreak({ scope: "plan", reason: "rest", until: "2026-11-13" }, "2026-11-11", [plan("c", "2026-11-12", "2026-11-14")])).toEqual({ ok: false, error: "already_paused" });
    expect(checkBreak({ scope: "item", reason: "rest", until: "2026-11-13" }, "2026-11-11", [])).toEqual({ ok: false, error: "item_required" });
  });

  it("offers an alternative before a gym pause, by reason", () => {
    expect(alternativeFor("item", "travel", true)).toMatch(/hotel-room/);
    expect(alternativeFor("item", "sick", true)).toBeNull();
  });
});

describe("a paused item or plan", () => {
  const gym = { id: "g", activityKey: "gym", label: "Gym", days: [1, 3, 5], startTime: "18:30", durationMin: 60, remindBeforeMin: 30, checkAfterMin: 180, position: 0, pauses: [{ from: "2026-11-11", until: "2026-11-25" }] };

  it("takes the item off the routine those days, so the gym day becomes a rest day", () => {
    expect(onDate(gym, "2026-11-11")).toMatchObject({ days: [], pausedOn: "2026-11-11" });
    expect(onDate(gym, "2026-11-26").days).toEqual([1, 3, 5]);
    expect(trainingDayOn("2026-11-11", [1, 3, 5], [gym])).toBe(false);
    expect(trainingDayOn("2026-11-27", [1, 3, 5], [gym])).toBe(true);
    expect(routineDayStatus([gym], 3, { workouts: 0, gymSkipped: null, sport: null, activities: [], walkMinutes: null, checks: new Map(), date: "2026-11-11", timezone: "Asia/Kolkata" } as never)).toEqual([]);
  });

  it("drops whole-plan paused days from the score and scales the week's goal", () => {
    const t = { calorieTarget: 2000, proteinTarget: 150, stepTarget: 8000, trainingDays: [], minMealSessions: 3 };
    const paused = scoreDay({ date: "2026-11-11", weekday: 3, mealSessions: 0, calories: 0, proteinG: 0, steps: 0, workoutsLogged: 0, paused: true }, t as never);
    expect(paused).toMatchObject({ paused: true, checks: [], onTrack: false });
    const ns = computeNorthStar([paused, paused, paused, paused, paused, paused, paused]);
    expect(ns.pausedDays).toBe(7);
    expect(ns.goal).toBe(0);
    expect(ns.mostMissed).toBeNull();
    expect(planBreakOn([plan("p", "2026-11-10", "2026-11-12")], "2026-11-12")?.id).toBe("p");
    expect(planBreakOn([plan("p", "2026-11-10", "2026-11-12")], "2026-11-13")).toBeNull();
  });

  it("sends the plan's end message to the resume screen and a short one for an item", () => {
    expect(pauseEndMessage({ id: "p", scope: "plan", reason: "travel" }, null, "2026-11-26")).toMatchObject({ url: "/app/#resume", card: { type: "pause_resume", breakId: "p" } });
    expect(pauseEndMessage({ id: "i", scope: "item", reason: "injured" }, "Gym", "2026-11-26").text).toMatch(/Gym is back.*stop if anything hurts/);
  });
});

describe("the first plan after a pause", () => {
  const label = (id: string) => (id === "gym" ? "Gym" : null);
  it("welcomes them back the day after a whole-plan pause, with the restart choice while it's open", () => {
    const r = pauseOverLine([plan("p", "2026-11-11", "2026-11-17")], "2026-11-18", label);
    expect(r?.text).toMatch(/Welcome back: your travel pause is over.*choose how to restart/);
    expect(r?.resumeBreakId).toBe("p");
    const done = pauseOverLine([{ ...plan("p", "2026-11-11", "2026-11-17"), resumedAt: "2026-11-17T19:00:00Z" }], "2026-11-18", label);
    expect(done?.text).not.toMatch(/choose how to restart/);
    expect(done?.resumeBreakId).toBeNull();
  });
  it("says a paused item is back, and covers a pause they ended early", () => {
    const gym = { ...plan("g", "2026-11-10", "2026-11-17"), scope: "item" as const, itemId: "gym", reason: "injured" as const, endedAt: "2026-11-18T06:00:00Z" };
    expect(pauseOverLine([gym], "2026-11-18", label)?.text).toBe("Gym is back on your routine from today: ease in and stop if anything hurts.");
  });
  it("says nothing on other days", () => {
    expect(pauseOverLine([plan("p", "2026-11-11", "2026-11-17")], "2026-11-17", label)).toBeNull();
    expect(pauseOverLine([plan("p", "2026-11-11", "2026-11-17")], "2026-11-19", label)).toBeNull();
  });
});
