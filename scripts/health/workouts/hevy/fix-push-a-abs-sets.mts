/**
 * Force Push A abs to 3 explicit-rep sets (Hevy app may hide rep_range-only sets).
 */
import "dotenv/config";

import { updateHevyRoutine, hevyApiBaseUrl } from "../../../../src/pillars/health/workouts/hevy/hevyClient.js";
import { hevyApiKeyFromEnv } from "../../../../src/pillars/health/workouts/hevy/hevyEnv.js";
import type { HevyPostRoutineBody } from "../../../../src/pillars/health/workouts/hevy/types.js";

const ROUTINE_ID = "ff269248-4336-4ff2-a243-6999005290d8";
const apiKey = hevyApiKeyFromEnv();
if (!apiKey) process.exit(1);

const base = hevyApiBaseUrl().replace(/\/$/, "");
const getRes = await fetch(`${base}/v1/routines/${ROUTINE_ID}`, {
  headers: { "api-key": apiKey, Accept: "application/json" },
});
const getJson = (await getRes.json()) as { routine?: { exercises: Ex[]; notes?: string } };
const raw = getJson.routine ?? (getJson as unknown as { exercises: Ex[]; notes?: string });

type Ex = {
  title?: string;
  exercise_template_id?: string;
  notes?: string | null;
  rest_seconds?: number;
  sets?: Record<string, unknown>[];
};

function sanitizeSet(s: Record<string, unknown>) {
  const out: Record<string, unknown> = { type: s.type ?? "normal" };
  if (s.reps != null) out.reps = s.reps;
  if (s.rep_range) out.rep_range = s.rep_range;
  if (s.weight_kg != null) out.weight_kg = s.weight_kg;
  if (s.duration_seconds != null) out.duration_seconds = s.duration_seconds;
  if (s.distance_meters != null) out.distance_meters = s.distance_meters;
  return out;
}

const threeAbsSets = () => [
  { type: "normal" as const, reps: 12 },
  { type: "normal" as const, reps: 12 },
  { type: "normal" as const, reps: 12 },
];

const exercises = ((raw as { exercises: Ex[] }).exercises ?? []).map((ex) => {
  const baseEx = {
    exercise_template_id: ex.exercise_template_id!,
    notes: ex.notes?.trim() ? ex.notes : null,
    sets: (ex.sets ?? []).map(sanitizeSet),
  };

  if (ex.title === "Cable Crunch") {
    return {
      exercise_template_id: ex.exercise_template_id!,
      rest_seconds: 60,
      notes:
        "Abs. 3×12–15 controlled reps. Flex the spine rather than pulling with the arms.",
      sets: threeAbsSets(),
    };
  }
  if (ex.title === "Hanging Knee Raise") {
    return {
      exercise_template_id: ex.exercise_template_id!,
      rest_seconds: 60,
      notes:
        "Abs. 3×12–15 controlled reps. Avoid swinging and control the lowering phase.",
      sets: threeAbsSets(),
    };
  }
  if (ex.rest_seconds && ex.rest_seconds > 0) {
    return { ...baseEx, rest_seconds: ex.rest_seconds };
  }
  return baseEx;
});

const payload: HevyPostRoutineBody = {
  routine: {
    title: "Push A",
    notes: (raw as { notes?: string }).notes ?? null,
    exercises,
  },
};

const updated = await updateHevyRoutine(apiKey, ROUTINE_ID, payload);
if (!updated.ok) {
  console.log(JSON.stringify({ success: false, error: updated.error, status: updated.status }));
  process.exit(1);
}

const verifyRes = await fetch(`${base}/v1/routines/${ROUTINE_ID}`, {
  headers: { "api-key": apiKey, Accept: "application/json" },
});
const vr = ((await verifyRes.json()) as { routine: { exercises: Ex[] } }).routine;

for (const name of ["Cable Crunch", "Hanging Knee Raise"]) {
  const ex = vr.exercises.find((e) => e.title === name);
  console.log(
    name,
    "sets:",
    ex?.sets?.length,
    ex?.sets?.map((s) => ({ reps: s.reps, rep_range: s.rep_range })),
  );
}

console.log(JSON.stringify({ success: true, routine_id: ROUTINE_ID }));
