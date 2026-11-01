import { beforeEach, describe, expect, it, vi } from "vitest";

/** In-memory health_hevy_proposals with just the query shapes the module uses. */
const db = vi.hoisted(() => ({ rows: [] as Array<Record<string, unknown>>, checks: new Map<string, unknown>() }));
const hevy = vi.hoisted(() => ({
  updateHevyRoutine: vi.fn(),
  createHevyRoutine: vi.fn(),
  createHevyWorkout: vi.fn(),
}));
const training = vi.hoisted(() => ({
  hevyKey: vi.fn(async () => "key"),
  loadRoutines: vi.fn(),
  exerciseCatalog: vi.fn(),
}));
const checkStore = vi.hoisted(() => ({ getWorkoutChecks: vi.fn(async () => new Map()), saveWorkoutCheckAnswer: vi.fn(async () => ({ ok: true })) }));

vi.mock("../tools/clients.js", () => {
  function query() {
    const filters: Array<(r: Record<string, unknown>) => boolean> = [];
    let patch: Record<string, unknown> | null = null;
    let insert: Record<string, unknown> | null = null;
    const run = () => {
      if (insert) {
        const row = { id: `00000000-0000-4000-8000-${String(db.rows.length + 1).padStart(12, "0")}`, status: "pending", hevy_id: null, error: null, ...insert };
        db.rows.push(row);
        return { data: row, error: null };
      }
      const hit = db.rows.filter((r) => filters.every((f) => f(r)));
      if (patch) for (const r of hit) Object.assign(r, patch);
      return { data: hit.map((r) => ({ ...r })), error: null };
    };
    const chain: Record<string, unknown> = {
      select: () => chain,
      insert: (row: Record<string, unknown>) => ((insert = row), chain),
      update: (p: Record<string, unknown>) => ((patch = p), chain),
      eq: (k: string, v: unknown) => (filters.push((r) => r[k] === v || k === "user_profile_id"), chain),
      in: (k: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[k])), chain),
      single: async () => run(),
      then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(run()).then(res, rej),
    };
    return chain;
  }
  return { supabase: { from: () => query() }, redis: {}, anthropic: {} };
});
vi.mock("../pillars/health/workouts/hevy/index.js", () => hevy);
vi.mock("./training.js", async (orig) => ({ ...(await orig<typeof import("./training.js")>()), ...training }));
vi.mock("./workoutCheckStore.js", () => checkStore);

import type { HevyRoutine } from "../pillars/health/workouts/hevy/index.js";
import {
  applyProposal,
  applyRoutineChanges,
  buildWorkoutBody,
  discardProposal,
  proposeRoutineChange,
  proposeWorkoutLog,
} from "./hevyProposals.js";

const routine: HevyRoutine = {
  id: "r1",
  title: "Push A",
  updated_at: "2026-10-20T10:00:00Z",
  exercises: [
    { index: 0, title: "Bench Press", exercise_template_id: "bench", rest_seconds: 120, sets: [{ index: 0, type: "warmup", reps: 10 }, { index: 1, type: "normal", reps: 5, weight_kg: 80 }] },
    { index: 1, title: "Lateral Raise", exercise_template_id: "lat", supersets_id: 1, sets: [{ index: 0, type: "normal", reps: 12, weight_kg: 10 }] },
    { index: 2, title: "Triceps Pushdown", exercise_template_id: "tri", sets: [{ type: "normal", rep_range: { start: 10, end: 12 } }] },
  ],
};
const titles = new Map([
  ["bench", "Bench Press (Barbell)"],
  ["lat", "Lateral Raise (Dumbbell)"],
  ["tri", "Triceps Pushdown"],
  ["clat", "Lateral Raise (Cable)"],
  ["dips", "Dips"],
]);
const ctx = { userProfileId: "u1", timezone: "Asia/Kolkata", now: new Date("2026-10-28T12:00:00Z") };

beforeEach(() => {
  db.rows = [];
  vi.clearAllMocks();
  training.loadRoutines.mockResolvedValue({ ok: true, routines: [structuredClone(routine)] });
  training.exerciseCatalog.mockResolvedValue({ ok: true, templates: [...titles].map(([id, title]) => ({ id, title })) });
  hevy.updateHevyRoutine.mockResolvedValue({ ok: true, routine: { id: "r1" } });
  hevy.createHevyWorkout.mockResolvedValue({ ok: true, workout: { id: "hw1" } });
});

describe("applyRoutineChanges", () => {
  it("swaps one exercise and keeps the rest exactly", () => {
    const r = applyRoutineChanges(routine, [{ op: "replace", exerciseTemplateId: "lat", newExerciseTemplateId: "clat", sets: [{ repRange: { start: 12, end: 15 } }, { repRange: { start: 12, end: 15 } }] }], titles);
    if (!r.ok) throw new Error(r.error);
    expect(r.exercises.map((e) => e.exercise_template_id)).toEqual(["bench", "clat", "tri"]);
    expect(r.exercises[1]).toMatchObject({ superset_id: 1, sets: [{ rep_range: { start: 12, end: 15 }, reps: null }, expect.anything()] });
    // Untouched exercises: same sets, no `index`, warm-up kept.
    expect(r.exercises[0]).toEqual({
      exercise_template_id: "bench",
      superset_id: null,
      rest_seconds: 120,
      notes: null,
      sets: [
        { type: "warmup", weight_kg: null, reps: 10, distance_meters: null, duration_seconds: null, custom_metric: null, rep_range: null },
        { type: "normal", weight_kg: 80, reps: 5, distance_meters: null, duration_seconds: null, custom_metric: null, rep_range: null },
      ],
    });
    expect(r.lines.map((l) => l.text)).toEqual([
      "Swap Lateral Raise (Dumbbell) → Lateral Raise (Cable) · 2 × 12–15",
      "2 other exercises unchanged",
    ]);
  });

  it("adds after a given exercise, updates sets and removes", () => {
    const r = applyRoutineChanges(
      routine,
      [
        { op: "add", exercise: { exerciseTemplateId: "dips", sets: [{ reps: 8 }, { reps: 8 }, { reps: 8 }] }, afterExerciseTemplateId: "bench" },
        { op: "update", exerciseTemplateId: "bench", sets: [{ reps: 6, weightKg: 82.5 }, { reps: 6, weightKg: 82.5 }], restSeconds: 150 },
        { op: "remove", exerciseTemplateId: "tri" },
      ],
      titles,
    );
    if (!r.ok) throw new Error(r.error);
    expect(r.exercises.map((e) => e.exercise_template_id)).toEqual(["bench", "dips", "lat"]);
    expect(r.exercises[0]!.rest_seconds).toBe(150);
    expect(r.lines.map((l) => l.kind)).toEqual(["add", "change", "remove", "keep"]);
    expect(r.lines[1]!.text).toBe("Bench Press (Barbell): 1 warm-up + 1 × 5 @ 80 kg → 2 × 6 @ 82.5 kg, rest 120s → 150s");
  });

  it("refuses unknown exercises and exercises not in the routine", () => {
    expect(applyRoutineChanges(routine, [{ op: "remove", exerciseTemplateId: "squat" }], titles)).toEqual({ ok: false, error: "not_in_routine:squat" });
    expect(
      applyRoutineChanges(routine, [{ op: "replace", exerciseTemplateId: "lat", newExerciseTemplateId: "nope" }], titles),
    ).toEqual({ ok: false, error: "unknown_exercise:nope" });
  });

  it("won't empty a routine", () => {
    const one: HevyRoutine = { ...routine, exercises: [routine.exercises![0]!] };
    expect(applyRoutineChanges(one, [{ op: "remove", exerciseTemplateId: "bench" }], titles)).toEqual({ ok: false, error: "routine_would_be_empty" });
  });
});

describe("buildWorkoutBody", () => {
  it("derives end time from duration and defaults set type", () => {
    const b = buildWorkoutBody({
      title: "Push",
      startTime: "2026-10-28T18:30:00+05:30",
      durationMin: 65,
      exercises: [{ exerciseTemplateId: "bench", sets: [{ weightKg: 80, reps: 5, rpe: 8 }] }],
    });
    expect(b.workout.start_time).toBe("2026-10-28T13:00:00.000Z");
    expect(b.workout.end_time).toBe("2026-10-28T14:05:00.000Z");
    expect(b.workout.exercises[0]!.sets[0]).toMatchObject({ type: "normal", weight_kg: 80, reps: 5, rpe: 8 });
  });
});

describe("proposal flow", () => {
  async function propose() {
    const r = await proposeRoutineChange(ctx, {
      routineId: "r1",
      reason: "Dumbbell laterals stalled at 10 kg for 7 weeks.",
      changes: [{ op: "replace", exerciseTemplateId: "lat", newExerciseTemplateId: "clat" }],
    });
    if (!r.ok) throw new Error(r.error);
    return r.card;
  }

  it("stores a pending proposal and writes nothing to Hevy", async () => {
    const card = await propose();
    expect(card).toMatchObject({ type: "hevy_proposal", kind: "routine_update", title: "Push A", status: "pending" });
    expect(hevy.updateHevyRoutine).not.toHaveBeenCalled();
  });

  it("applies exactly once", async () => {
    const card = await propose();
    expect(await applyProposal(ctx, card.proposalId)).toEqual({ ok: true, status: "applied", hevyId: "r1" });
    expect(await applyProposal(ctx, card.proposalId)).toMatchObject({ ok: true, alreadyApplied: true });
    expect(hevy.updateHevyRoutine).toHaveBeenCalledTimes(1);
    const body = hevy.updateHevyRoutine.mock.calls[0]![2];
    expect(body.routine.exercises.map((e: { exercise_template_id: string }) => e.exercise_template_id)).toEqual(["bench", "clat", "tri"]);
  });

  it("refuses when the routine was edited in Hevy after the proposal", async () => {
    const card = await propose();
    training.loadRoutines.mockResolvedValue({ ok: true, routines: [{ ...routine, updated_at: "2026-10-28T09:00:00Z" }] });
    expect(await applyProposal(ctx, card.proposalId)).toEqual({ ok: false, status: "failed", error: "routine_changed_in_hevy" });
    expect(hevy.updateHevyRoutine).not.toHaveBeenCalled();
  });

  it("can retry after a failed Hevy write", async () => {
    const card = await propose();
    hevy.updateHevyRoutine.mockResolvedValueOnce({ ok: false, error: "HTTP 500" });
    expect(await applyProposal(ctx, card.proposalId)).toMatchObject({ ok: false, status: "failed" });
    expect(await applyProposal(ctx, card.proposalId)).toMatchObject({ ok: true, status: "applied" });
  });

  it("a discarded proposal can't be applied", async () => {
    const card = await propose();
    expect(await discardProposal(ctx, card.proposalId)).toEqual({ ok: true });
    expect(await applyProposal(ctx, card.proposalId)).toEqual({ ok: false, error: "proposal_discarded" });
  });

  it("rejects unknown exercise ids before storing anything", async () => {
    const r = await proposeRoutineChange(ctx, {
      routineId: "r1",
      reason: "x",
      changes: [{ op: "replace", exerciseTemplateId: "lat", newExerciseTemplateId: "made-up" }],
    });
    expect(r).toEqual({ ok: false, error: "unknown_exercise:made-up" });
    expect(db.rows).toHaveLength(0);
  });

  it("logging a workout settles that day's missed-workout check", async () => {
    checkStore.getWorkoutChecks.mockResolvedValueOnce(
      new Map([["2026-10-28", { localDate: "2026-10-28", gymTime: "18:30", status: "missing", hevyWorkoutId: null, reason: null }]]),
    );
    const r = await proposeWorkoutLog(ctx, {
      title: "Push",
      startTime: "2026-10-28T15:30:00+05:30",
      durationMin: 60,
      exercises: [{ exerciseTemplateId: "bench", sets: [{ weightKg: 80, reps: 5 }] }],
    });
    if (!r.ok) throw new Error(r.error);
    expect(r.card.lines[0]!.kind).toBe("info");
    expect(await applyProposal(ctx, r.card.proposalId)).toMatchObject({ ok: true, hevyId: "hw1" });
    expect(checkStore.saveWorkoutCheckAnswer).toHaveBeenCalledWith("u1", expect.objectContaining({ status: "found", hevyWorkoutId: "hw1" }));
  });

  it("won't log a workout in the future", async () => {
    const r = await proposeWorkoutLog(ctx, {
      title: "Push",
      startTime: "2026-10-29T18:30:00+05:30",
      durationMin: 60,
      exercises: [{ exerciseTemplateId: "bench", sets: [{ weightKg: 80, reps: 5 }] }],
    });
    expect(r).toEqual({ ok: false, error: "future_date" });
  });
});
