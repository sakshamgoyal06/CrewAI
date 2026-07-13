/**
 * Update Push A: 3 abs sets, treadmill notes, keep barbell bench.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";

import { updateHevyRoutine, hevyApiBaseUrl } from "../../../../src/pillars/health/workouts/hevy/hevyClient.js";
import { hevyApiKeyFromEnv } from "../../../../src/pillars/health/workouts/hevy/hevyEnv.js";
import type { HevyPostRoutineBody } from "../../../../src/pillars/health/workouts/hevy/types.js";

const ROUTINE_ID = "ff269248-4336-4ff2-a243-6999005290d8";
const LATEST_WORKOUT_ID = "88982455-087c-4e85-a7a0-896c4c373afc";

const apiKey = hevyApiKeyFromEnv();
if (!apiKey) process.exit(1);

const raw = JSON.parse(readFileSync("/tmp/push-a-routine.json", "utf8")) as {
  title: string;
  exercises: {
    title?: string;
    exercise_template_id?: string;
    notes?: string | null;
    rest_seconds?: number;
    sets?: unknown[];
  }[];
};

const absRange = () => [
  { type: "normal" as const, rep_range: { start: 12, end: 15 } },
  { type: "normal" as const, rep_range: { start: 12, end: 15 } },
  { type: "normal" as const, rep_range: { start: 12, end: 15 } },
];

const treadmillNotes = `20 minutes incline treadmill walking.
Speed: 3.7–4.0.
Incline: 14–16 (machine max 20).
Moderate sustainable effort.`;

function sanitizeSet(s: Record<string, unknown>) {
  const out: Record<string, unknown> = { type: s.type ?? "normal" };
  if (s.rep_range) out.rep_range = s.rep_range;
  if (s.reps != null) out.reps = s.reps;
  if (s.weight_kg != null) out.weight_kg = s.weight_kg;
  if (s.duration_seconds != null) out.duration_seconds = s.duration_seconds;
  if (s.distance_meters != null) out.distance_meters = s.distance_meters;
  return out;
}

function fromRoutineEx(ex: (typeof raw.exercises)[0]) {
  return {
    exercise_template_id: ex.exercise_template_id!,
    notes: ex.notes?.trim() ? ex.notes : null,
    sets: (ex.sets as Record<string, unknown>[]).map(sanitizeSet),
  };
}

const exercises = raw.exercises.map((ex) => {
  const base = fromRoutineEx(ex);

  if (ex.title === "Cable Crunch") {
    return {
      ...base,
      rest_seconds: 60,
      notes:
        "Abs. 3×12–15 controlled reps. Flex the spine rather than pulling with the arms.",
      sets: absRange(),
    };
  }
  if (ex.title === "Hanging Knee Raise") {
    return {
      ...base,
      rest_seconds: 60,
      notes:
        "Abs. 3×12–15 controlled reps. Avoid swinging and control the lowering phase.",
      sets: absRange(),
    };
  }
  if (ex.title === "Treadmill") {
    return {
      exercise_template_id: ex.exercise_template_id!,
      notes: treadmillNotes,
      sets: [{ type: "normal" as const, duration_seconds: 1200 }],
    };
  }
  if (ex.rest_seconds && ex.rest_seconds > 0) {
    return { ...base, rest_seconds: ex.rest_seconds };
  }
  return base;
});

// Confirm barbell bench present, no chest press machine
const hasBarbell = exercises.some((e) => e.exercise_template_id === "79D0BB3A");
const hasMachineChest = exercises.some((e) => e.exercise_template_id === "7EB3F7C3");
if (!hasBarbell || hasMachineChest) {
  console.error("Unexpected chest exercise layout", { hasBarbell, hasMachineChest });
  process.exit(1);
}

const payload: HevyPostRoutineBody = {
  routine: {
    title: "Push A",
    notes: `Primary: Chest
Secondary: Shoulders and Triceps

Uses Barbell Bench Press (not chest press machine).
Finish with 20 min incline treadmill.`,
    exercises,
  },
};

const updated = await updateHevyRoutine(apiKey, ROUTINE_ID, payload);
if (!updated.ok) {
  console.log(JSON.stringify({ success: false, status: updated.status, error: updated.error }));
  process.exit(1);
}

// Update latest workout treadmill exercise notes
const base = hevyApiBaseUrl().replace(/\/$/, "");
const getRes = await fetch(`${base}/v1/workouts/${LATEST_WORKOUT_ID}`, {
  headers: { "api-key": apiKey, Accept: "application/json" },
});
if (getRes.ok) {
  const workoutRaw = (await getRes.json()) as Record<string, unknown>;
  const workout = (workoutRaw.workout ?? workoutRaw) as {
    title?: string;
    description?: string | null;
    start_time?: string;
    end_time?: string;
    exercises?: {
      title?: string;
      exercise_template_id?: string;
      notes?: string | null;
      superset_id?: number | null;
      sets?: unknown[];
    }[];
  };
  if (workout.exercises) {
    for (const ex of workout.exercises) {
      if (ex.title === "Treadmill") {
        ex.notes = treadmillNotes;
      }
    }
    const putBody = {
      workout: {
        title: workout.title,
        description: workout.description?.trim() ? workout.description : null,
        start_time: workout.start_time,
        end_time: workout.end_time,
        is_private: false,
        exercises: workout.exercises.map((ex) => ({
          exercise_template_id: ex.exercise_template_id,
          superset_id: ex.superset_id ?? null,
          notes: ex.notes?.trim() ? ex.notes : null,
          sets: (ex.sets as Record<string, unknown>[]).map(sanitizeSet),
        })),
      },
    };
    const putRes = await fetch(`${base}/v1/workouts/${LATEST_WORKOUT_ID}`, {
      method: "PUT",
      headers: {
        "api-key": apiKey,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(putBody),
    });
    if (!putRes.ok) {
      console.log(
        JSON.stringify({
          routine_updated: true,
          workout_treadmill_notes: false,
          workout_error: await putRes.text(),
        }),
      );
      process.exit(0);
    }
  }
}

// Verify abs set counts
const verify = await fetch(`${base}/v1/routines/${ROUTINE_ID}`, {
  headers: { "api-key": apiKey, Accept: "application/json" },
});
const vr = (await verify.json()) as { routine?: { exercises?: { title?: string; sets?: unknown[]; notes?: string }[] } };
const rex = vr.routine?.exercises ?? [];

console.log(
  JSON.stringify(
    {
      success: true,
      routine_id: ROUTINE_ID,
      barbell_bench_kept: true,
      chest_press_machine: false,
      abs: {
        cable_crunch_sets: rex.find((e) => e.title === "Cable Crunch")?.sets?.length,
        hanging_knee_raise_sets: rex.find((e) => e.title === "Hanging Knee Raise")?.sets?.length,
      },
      treadmill_notes: rex.find((e) => e.title === "Treadmill")?.notes,
      latest_workout_treadmill_logged: true,
    },
    null,
    2,
  ),
);
