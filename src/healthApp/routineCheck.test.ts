import type { RoutineCheck } from "./routine.js";
import { describe, expect, it, vi } from "vitest";

vi.mock("../tools/clients.js", () => ({ supabase: {}, anthropic: {} }));

import type { RoutineItem, RoutineItemStatus } from "./routine.js";
import { answerRoutineCheck, runRoutineTick } from "./routineCheck.js";
import { gymPlans } from "./workoutCheck.js";

const TZ = "Asia/Kolkata";
const walk: RoutineItem = { id: "11111111-1111-4111-8111-111111111111", activityKey: "walking", label: "Morning walk", days: [0, 1, 2, 3, 4, 5, 6], startTime: "07:00", durationMin: 30, remindBeforeMin: 15, checkAfterMin: 90, position: 0 };
const gym: RoutineItem = { id: "22222222-2222-4222-8222-222222222222", activityKey: "gym", label: "Evening gym", days: [1, 3, 5], startTime: "18:30", durationMin: 60, remindBeforeMin: 30, checkAfterMin: 180, position: 1 };

const profile = (routine: RoutineItem[] | null) => async () => ({
  timezone: TZ,
  targets: { calorieTarget: null, proteinTarget: null, stepTarget: 8000, trainingDays: [1, 3, 5], minMealSessions: 3 },
  gym: { time: "18:30", checkDelayMin: 180 },
  routine,
});

function statusOf(state: RoutineItemStatus["state"]) {
  return async (_u: string, _tz: string, items: RoutineItem[], dates: string[]) =>
    new Map(dates.map((d) => [d, items.map((i) => ({ itemId: i.id, label: i.label, activityKey: i.activityKey, startTime: i.startTime, durationMin: i.durationMin, gym: i.activityKey === "gym", state, detail: "" }))]));
}

function deps(state: RoutineItemStatus["state"], off: string[] = []) {
  return {
    loadProfile: profile([walk, gym]) as never,
    status: statusOf(state) as never,
    insertCheck: vi.fn(async () => true),
    postMessage: vi.fn(async () => {}),
    notify: vi.fn(async () => ({ sent: true, delivered: 1 })),
    prefs: async () => ({ quietStart: "22:30", quietEnd: "07:00", off: off as never }),
  };
}

describe("runRoutineTick", () => {
  it("sends the reminder before the walk, even inside quiet hours", async () => {
    const d = deps("pending");
    const r = await runRoutineTick("u", new Date("2026-11-03T01:16:00Z"), d); // 06:46 IST
    expect(r.reminders).toBe(1);
    expect(d.notify).toHaveBeenCalledWith("u", expect.objectContaining({ kind: "routine_reminder", dedupeKey: `routine_reminder:${walk.id}:2026-11-03`, title: "Morning walk in 14 min" }));
  });

  it("skips the reminder when it's off or already done", async () => {
    expect((await runRoutineTick("u", new Date("2026-11-03T01:16:00Z"), deps("pending", ["routine_reminder"]))).reminders).toBe(0);
    expect((await runRoutineTick("u", new Date("2026-11-03T01:16:00Z"), deps("done"))).reminders).toBe(0);
  });

  it("asks in chat when the walk isn't logged after the slot", async () => {
    const d = deps("pending");
    const r = await runRoutineTick("u", new Date("2026-11-03T03:00:00Z"), d); // 08:30 IST
    expect(r.followUps).toEqual([{ itemId: walk.id, date: "2026-11-03", status: "missing" }]);
    expect(d.postMessage).toHaveBeenCalledWith("u", "No sign of your morning walk (7:00 am). Did you get it in?", [expect.objectContaining({ type: "routine_check", itemId: walk.id, status: "missing" })]);
    expect(d.notify).toHaveBeenCalledWith("u", expect.objectContaining({ kind: "routine_check" }));
  });

  it("records done quietly, and never asks twice", async () => {
    const done = deps("done");
    expect((await runRoutineTick("u", new Date("2026-11-03T03:00:00Z"), done)).followUps[0]!.status).toBe("done");
    expect(done.postMessage).not.toHaveBeenCalled();
    const again = { ...deps("pending"), insertCheck: vi.fn(async () => false) };
    expect((await runRoutineTick("u", new Date("2026-11-03T03:00:00Z"), again)).followUps).toEqual([]);
    expect(again.postMessage).not.toHaveBeenCalled();
  });

  it("does nothing without a routine", async () => {
    const d = { ...deps("pending"), loadProfile: profile(null) as never };
    expect(await runRoutineTick("u", new Date("2026-11-03T03:00:00Z"), d)).toEqual({ reminders: 0, followUps: [] });
  });
});

describe("answerRoutineCheck", () => {
  const ctx = { userProfileId: "u", timezone: TZ, now: new Date("2026-11-03T05:00:00Z") };
  const base = () => ({
    loadProfile: profile([walk, gym]) as never,
    status: statusOf("pending") as never,
    save: vi.fn(async () => ({ ok: true })),
    logActivity: vi.fn(async () => ({ ok: true as const, activity: { id: "act-1" } as never, alreadySaved: false, training: { countsAsTraining: false, neededKcal: null, note: null, short: false } })),
    current: vi.fn(async (): Promise<RoutineCheck | undefined> => undefined),
    removeActivity: vi.fn(async () => ({ ok: true })),
  });

  it("done logs the walk at its planned time and length, idempotently", async () => {
    const d = base();
    expect(await answerRoutineCheck(ctx, { itemId: walk.id, answer: "done" }, d)).toEqual({ ok: true, status: "done", label: "Morning walk" });
    expect(d.logActivity).toHaveBeenCalledWith(ctx, expect.objectContaining({
      draftId: `routine:${walk.id}:2026-11-03`, key: "walking", label: "Walking", durationMin: 30, startTime: "2026-11-03T01:30:00.000Z",
    }));
    expect(d.save).toHaveBeenCalledWith("u", expect.objectContaining({ status: "done", activityId: "act-1" }));
  });

  it("done with a different length logs those minutes", async () => {
    const d = base();
    await answerRoutineCheck(ctx, { itemId: walk.id, answer: "done", durationMin: 15 }, d);
    expect(d.logActivity).toHaveBeenCalledWith(ctx, expect.objectContaining({ durationMin: 15 }));
  });

  it("skipped keeps the reason; recheck reports missing", async () => {
    const d = base();
    await answerRoutineCheck(ctx, { itemId: walk.id, answer: "skipped", reason: "Rain" }, d);
    expect(d.save).toHaveBeenCalledWith("u", expect.objectContaining({ status: "skipped", reason: "Rain" }));
    expect(await answerRoutineCheck(ctx, { itemId: walk.id, answer: "recheck" }, d)).toEqual({ ok: true, status: "missing", label: "Morning walk" });
  });

  it("undo clears the answer and removes the activity a done logged", async () => {
    const d = base();
    d.current.mockResolvedValue({ itemId: walk.id, localDate: "2026-11-03", label: "Morning walk", status: "done", reason: null, activityId: "act-1" });
    expect(await answerRoutineCheck(ctx, { itemId: walk.id, answer: "undo" }, d)).toEqual({ ok: true, status: "missing", label: "Morning walk" });
    expect(d.removeActivity).toHaveBeenCalledWith(ctx, "act-1");
    expect(d.save).toHaveBeenCalledWith("u", expect.objectContaining({ status: "missing", activityId: null }));
  });

  it("changing a done to skipped takes its activity out too", async () => {
    const d = base();
    d.current.mockResolvedValue({ itemId: walk.id, localDate: "2026-11-03", label: "Morning walk", status: "done", reason: null, activityId: "act-1" });
    await answerRoutineCheck(ctx, { itemId: walk.id, answer: "skipped", reason: "Rain" }, d);
    expect(d.removeActivity).toHaveBeenCalledWith(ctx, "act-1");
    expect(d.save).toHaveBeenCalledWith("u", expect.objectContaining({ status: "skipped", activityId: null }));
  });

  it("a different length on a changed answer rewrites the activity", async () => {
    const d = base();
    await answerRoutineCheck(ctx, { itemId: walk.id, answer: "done", durationMin: 15 }, d);
    expect(d.logActivity).toHaveBeenCalledWith(ctx, expect.objectContaining({ durationMin: 15, replace: true }));
  });

  it("refuses the gym, unknown items and future dates", async () => {
    expect(await answerRoutineCheck(ctx, { itemId: gym.id, answer: "done" }, base())).toEqual({ ok: false, error: "gym_uses_workout_check" });
    expect(await answerRoutineCheck(ctx, { itemId: "33333333-3333-4333-8333-333333333333", answer: "done" }, base())).toEqual({ ok: false, error: "routine_item_not_found" });
    expect(await answerRoutineCheck(ctx, { itemId: walk.id, answer: "done", date: "2026-11-04" }, base())).toEqual({ ok: false, error: "future_date" });
  });
});

describe("gymPlans", () => {
  const targets = { trainingDays: [1, 3, 5] };
  it("uses the legacy slot without a routine", () => {
    expect(gymPlans({ targets, gym: { time: "18:30", checkDelayMin: 180 }, routine: null })).toEqual([{ trainingDays: [1, 3, 5], slot: { time: "18:30", checkDelayMin: 180 } }]);
  });
  it("uses each gym item's days and time, and checks untimed ones in the evening", () => {
    const morning = { ...gym, id: "m", days: [6], startTime: null };
    expect(gymPlans({ targets, gym: { time: null, checkDelayMin: 180 }, routine: [walk, gym, morning] })).toEqual([
      { trainingDays: [1, 3, 5], slot: { time: "18:30", checkDelayMin: 180 } },
      { trainingDays: [6], slot: { time: "21:00", checkDelayMin: 0 } },
    ]);
  });
  it("has no gym checks when the routine has no gym", () => {
    expect(gymPlans({ targets, gym: { time: "18:30", checkDelayMin: 180 }, routine: [walk] })).toEqual([]);
  });
});
