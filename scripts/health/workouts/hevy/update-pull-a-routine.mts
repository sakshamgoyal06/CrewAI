/**
 * Update Pull A: replace Assisted Pull-Up with Close Grip Lat Pulldown.
 */
import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";

import { hevyApiBaseUrl, updateHevyRoutine } from "../../../../src/pillars/health/workouts/hevy/hevyClient.js";
import { hevyApiKeyFromEnv } from "../../../../src/pillars/health/workouts/hevy/hevyEnv.js";
import type { HevyPostRoutineBody } from "../../../../src/pillars/health/workouts/hevy/types.js";

const ROUTINE_ID = "d49e80cd-a75e-4471-9a69-c20924b4ce5c";
const CLOSE_GRIP_LAT_PULLDOWN = "4E5257DE";
const ASSISTED_PULL_UP = "2C37EC5E";

const apiKey = hevyApiKeyFromEnv();
if (!apiKey) {
  console.error("Missing HEVY_API_KEY");
  process.exit(1);
}

const base = hevyApiBaseUrl().replace(/\/$/, "");
const res = await fetch(`${base}/v1/routines/${encodeURIComponent(ROUTINE_ID)}`, {
  headers: { "api-key": apiKey, Accept: "application/json" },
});
if (!res.ok) {
  console.error("FETCH_FAILED", res.status, await res.text());
  process.exit(1);
}
const data = (await res.json()) as { routine?: Record<string, unknown> };
const routine = (data.routine ?? data) as {
  title: string;
  notes?: string | null;
  exercises: {
    title?: string;
    exercise_template_id?: string;
    notes?: string | null;
    rest_seconds?: number;
    sets?: Record<string, unknown>[];
  }[];
};

writeFileSync("/tmp/pull-a-routine-before.json", JSON.stringify(routine, null, 2));

function sanitizeSet(s: Record<string, unknown>) {
  const out: Record<string, unknown> = { type: s.type ?? "normal" };
  if (s.rep_range) out.rep_range = s.rep_range;
  if (s.reps != null) out.reps = s.reps;
  if (s.weight_kg != null) out.weight_kg = s.weight_kg;
  if (s.duration_seconds != null) out.duration_seconds = s.duration_seconds;
  if (s.distance_meters != null) out.distance_meters = s.distance_meters;
  return out;
}

const closeGripNotes = `3 working sets of 8–10.
Progress after clean 10/10/10.
Close/V-bar grip on cable lat pulldown.
Pull elbows down toward ribs.
Keep chest tall.
Stable stack — replaces assisted pull-up (unstable machine).`;

let replaced = false;
const exercises = routine.exercises.map((ex) => {
  const id = ex.exercise_template_id ?? "";
  const title = ex.title ?? "";
  const isAssist =
    id.toUpperCase() === ASSISTED_PULL_UP ||
    /pull up \(assisted\)|assisted pull/i.test(title);

  if (isAssist) {
    replaced = true;
    return {
      exercise_template_id: CLOSE_GRIP_LAT_PULLDOWN,
      rest_seconds: ex.rest_seconds ?? 150,
      notes: closeGripNotes,
      sets: [
        { type: "normal", rep_range: { start: 8, end: 10 } },
        { type: "normal", rep_range: { start: 8, end: 10 } },
        { type: "normal", rep_range: { start: 8, end: 10 } },
      ],
    };
  }

  return {
    exercise_template_id: id,
    rest_seconds: ex.rest_seconds,
    notes: ex.notes?.trim() ? ex.notes : null,
    sets: (ex.sets ?? []).map(sanitizeSet),
  };
});

if (!replaced) {
  console.error("No assisted pull-up exercise found in routine — aborting");
  process.exit(1);
}

const body: HevyPostRoutineBody = {
  routine: {
    title: routine.title,
    notes: routine.notes ?? null,
    exercises,
  },
};

writeFileSync("/tmp/pull-a-routine-after.json", JSON.stringify(body, null, 2));
console.log("PAYLOAD_PREVIEW", JSON.stringify(body.routine.exercises.map((e) => ({
  id: e.exercise_template_id,
  notes: e.notes?.slice(0, 60),
})), null, 2));

const updated = await updateHevyRoutine(apiKey, ROUTINE_ID, body);
if (!updated.ok) {
  console.error("UPDATE_FAILED", updated.status, updated.error);
  process.exit(1);
}

console.log("OK", JSON.stringify({ id: updated.routine.id, title: updated.routine.title }));
