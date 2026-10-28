import { describe, expect, it, vi } from "vitest";

vi.mock("../tools/clients.js", () => ({ supabase: {}, redis: {}, anthropic: {} }));

import { checkTime, formatTime, zonedInstant } from "./gymSlot.js";
import { answerWorkoutCheck, dueWorkoutChecks, missedWorkoutMessage, runWorkoutChecks } from "./workoutCheck.js";
import type { WorkoutCheck } from "./workoutCheckStore.js";

const TZ = "Asia/Kolkata";
// 2026-10-28 is a Wednesday (3).
const WED = [3];

describe("zonedInstant", () => {
  it("converts local wall time to UTC", () => {
    expect(zonedInstant("2026-10-28", "18:30", TZ).toISOString()).toBe("2026-10-28T13:00:00.000Z");
  });
  it("handles DST: New York is UTC-4 before Nov 1 2026 and UTC-5 after", () => {
    expect(zonedInstant("2026-10-30", "18:00", "America/New_York").toISOString()).toBe("2026-10-30T22:00:00.000Z");
    expect(zonedInstant("2026-11-02", "18:00", "America/New_York").toISOString()).toBe("2026-11-02T23:00:00.000Z");
  });
});

describe("checkTime / formatTime", () => {
  it("adds the delay and wraps past midnight", () => {
    expect(checkTime({ time: "18:30", checkDelayMin: 180 })).toBe("21:30");
    expect(checkTime({ time: "22:00", checkDelayMin: 180 })).toBe("01:00");
    expect(checkTime({ time: null, checkDelayMin: 180 })).toBeNull();
  });
  it("formats 12-hour time", () => {
    expect(formatTime("18:30")).toBe("6:30 pm");
    expect(formatTime("00:05")).toBe("12:05 am");
  });
});

describe("dueWorkoutChecks", () => {
  const slot = { time: "18:30", checkDelayMin: 180 };
  it("is not due before gym time + delay", () => {
    // 21:29 IST
    const now = new Date("2026-10-28T15:59:00Z");
    expect(dueWorkoutChecks({ now, timezone: TZ, trainingDays: WED, slot })).toEqual([]);
  });
  it("is due at gym time + delay on a training day", () => {
    const now = new Date("2026-10-28T16:00:00Z"); // 21:30 IST
    const due = dueWorkoutChecks({ now, timezone: TZ, trainingDays: WED, slot });
    expect(due.map((d) => d.date)).toEqual(["2026-10-28"]);
  });
  it("skips rest days and days without a slot", () => {
    const now = new Date("2026-10-28T16:00:00Z");
    expect(dueWorkoutChecks({ now, timezone: TZ, trainingDays: [1], slot })).toEqual([]);
    expect(dueWorkoutChecks({ now, timezone: TZ, trainingDays: WED, slot: { time: null, checkDelayMin: 180 } })).toEqual([]);
  });
  it("checks yesterday's late slot after midnight", () => {
    const late = { time: "22:00", checkDelayMin: 180 };
    const now = new Date("2026-10-28T19:40:00Z"); // 01:10 IST Thursday
    const due = dueWorkoutChecks({ now, timezone: TZ, trainingDays: WED, slot: late });
    expect(due.map((d) => d.date)).toEqual(["2026-10-28"]);
  });
  it("gives up on a check more than 12 hours late", () => {
    const now = new Date("2026-10-29T04:30:00Z"); // 10:00 IST Thursday
    expect(dueWorkoutChecks({ now, timezone: TZ, trainingDays: WED, slot })).toEqual([]);
  });
});

function deps(over: {
  existing?: Map<string, WorkoutCheck>;
  hevy?: { connected: boolean; fetched: boolean; workouts: Array<{ localDate: string; id: string }> };
  inserted?: boolean;
} = {}) {
  const posted: Array<{ content: string; cards: unknown[] }> = [];
  const inserts: WorkoutCheck[] = [];
  const hevy = over.hevy ?? { connected: true, fetched: true, workouts: [] };
  return {
    posted,
    inserts,
    d: {
      loadProfile: vi.fn(async () => ({
        timezone: TZ,
        targets: { calorieTarget: null, proteinTarget: null, stepTarget: 8000, trainingDays: WED, minMealSessions: 3 },
        gym: { time: "18:30", checkDelayMin: 180 },
      })),
      recentWorkouts: vi.fn(async () => ({
        ...hevy,
        workouts: hevy.workouts.map((w) => ({
          id: w.id,
          title: "Push",
          localDate: w.localDate,
          startTime: null,
          durationMin: 60,
          exerciseCount: 5,
        })),
      })),
      getChecks: vi.fn(async () => over.existing ?? new Map()),
      insertCheck: vi.fn(async (_u: string, c: WorkoutCheck) => {
        inserts.push(c);
        return over.inserted ?? true;
      }),
      postMessage: vi.fn(async (_u: string, content: string, cards: unknown[]) => {
        posted.push({ content, cards });
      }),
    },
  };
}

const DUE_NOW = new Date("2026-10-28T16:05:00Z");

describe("runWorkoutChecks", () => {
  it("asks in chat when Hevy has no workout that day", async () => {
    const { d, posted, inserts } = deps();
    const out = await runWorkoutChecks("u1", DUE_NOW, d);
    expect(out).toEqual([{ date: "2026-10-28", status: "missing" }]);
    expect(inserts[0]).toMatchObject({ status: "missing", gymTime: "18:30" });
    expect(posted).toHaveLength(1);
    expect(posted[0]!.content).toContain("6:30 pm gym slot was 3 hours ago");
    expect(posted[0]!.cards[0]).toMatchObject({ type: "workout_check", date: "2026-10-28", status: "missing" });
  });

  it("records a found workout without messaging", async () => {
    const { d, posted, inserts } = deps({
      hevy: { connected: true, fetched: true, workouts: [{ localDate: "2026-10-28", id: "w9" }] },
    });
    const out = await runWorkoutChecks("u1", DUE_NOW, d);
    expect(out).toEqual([{ date: "2026-10-28", status: "found" }]);
    expect(inserts[0]).toMatchObject({ status: "found", hevyWorkoutId: "w9" });
    expect(posted).toHaveLength(0);
  });

  it("runs at most once per day", async () => {
    const existing = new Map<string, WorkoutCheck>([
      ["2026-10-28", { localDate: "2026-10-28", gymTime: "18:30", status: "missing", hevyWorkoutId: null, reason: null }],
    ]);
    const { d, posted } = deps({ existing });
    expect(await runWorkoutChecks("u1", DUE_NOW, d)).toEqual([]);
    expect(d.recentWorkouts).not.toHaveBeenCalled();
    expect(posted).toHaveLength(0);
  });

  it("doesn't message when another run inserted the row first", async () => {
    const { d, posted } = deps({ inserted: false });
    expect(await runWorkoutChecks("u1", DUE_NOW, d)).toEqual([]);
    expect(posted).toHaveLength(0);
  });

  it("waits when Hevy can't be read, instead of calling it a miss", async () => {
    const { d, inserts } = deps({ hevy: { connected: true, fetched: false, workouts: [] } });
    expect(await runWorkoutChecks("u1", DUE_NOW, d)).toEqual([]);
    expect(inserts).toHaveLength(0);
  });

  it("does nothing before the check time", async () => {
    const { d } = deps();
    expect(await runWorkoutChecks("u1", new Date("2026-10-28T12:00:00Z"), d)).toEqual([]);
    expect(d.getChecks).not.toHaveBeenCalled();
  });
});

describe("missedWorkoutMessage", () => {
  it("says yesterday for a late slot checked after midnight", () => {
    expect(missedWorkoutMessage("2026-10-28", "2026-10-29", { time: "22:00", checkDelayMin: 180 })).toMatch(
      /^Yesterday's 10:00 pm gym slot/,
    );
  });
});

describe("answerWorkoutCheck", () => {
  const ctx = { userProfileId: "u1", timezone: TZ, now: DUE_NOW };
  function answerDeps(workouts: Array<{ localDate: string; id: string }> = []) {
    const base = deps({ hevy: { connected: true, fetched: true, workouts } });
    const saved: WorkoutCheck[] = [];
    return {
      saved,
      d: {
        loadProfile: base.d.loadProfile,
        recentWorkouts: base.d.recentWorkouts,
        save: vi.fn(async (_u: string, c: WorkoutCheck) => {
          saved.push(c);
          return { ok: true };
        }),
      },
    };
  }

  it("stores a skip with its reason", async () => {
    const { d, saved } = answerDeps();
    const r = await answerWorkoutCheck(ctx, { answer: "skipped", reason: " work ran late " }, d);
    expect(r).toEqual({ ok: true, status: "skipped" });
    expect(saved[0]).toMatchObject({ localDate: "2026-10-28", status: "skipped", reason: "work ran late" });
  });

  it("recheck finds a workout logged since", async () => {
    const { d, saved } = answerDeps([{ localDate: "2026-10-28", id: "w2" }]);
    expect(await answerWorkoutCheck(ctx, { answer: "recheck" }, d)).toEqual({ ok: true, status: "found" });
    expect(saved[0]).toMatchObject({ status: "found", hevyWorkoutId: "w2" });
  });

  it("recheck with still nothing in Hevy changes nothing", async () => {
    const { d, saved } = answerDeps();
    expect(await answerWorkoutCheck(ctx, { answer: "recheck" }, d)).toEqual({ ok: true, status: "missing" });
    expect(saved).toHaveLength(0);
  });

  it("rejects future dates", async () => {
    const { d } = answerDeps();
    expect(await answerWorkoutCheck(ctx, { date: "2026-10-30", answer: "skipped" }, d)).toEqual({
      ok: false,
      error: "future_date",
    });
  });
});
