/**
 * Fix Bicep Curl set 2 weight on latest Pre-Program Primer workout.
 */
import "dotenv/config";

import { hevyApiBaseUrl } from "../../../../src/pillars/health/workouts/hevy/hevyClient.js";
import { hevyApiKeyFromEnv } from "../../../../src/pillars/health/workouts/hevy/hevyEnv.js";

const WORKOUT_ID = "0020f58c-1fb6-4928-9ac9-ac712bfefb57";

const apiKey = hevyApiKeyFromEnv();
if (!apiKey) process.exit(1);

const base = hevyApiBaseUrl().replace(/\/$/, "");
const getRes = await fetch(`${base}/v1/workouts/${WORKOUT_ID}`, {
  headers: { "api-key": apiKey, Accept: "application/json" },
});
if (!getRes.ok) {
  console.error("GET failed", getRes.status, await getRes.text());
  process.exit(1);
}

const raw = (await getRes.json()) as Record<string, unknown>;
const workout = (raw.workout ?? raw) as {
  title?: string;
  description?: string;
  start_time?: string;
  end_time?: string;
  routine_id?: string;
  exercises?: {
    index?: number;
    title?: string;
    notes?: string;
    exercise_template_id?: string;
    superset_id?: number | null;
    sets?: {
      index?: number;
      type?: string;
      weight_kg?: number | null;
      reps?: number | null;
      distance_meters?: number | null;
      duration_seconds?: number | null;
      rpe?: number | null;
      custom_metric?: number | null;
    }[];
  }[];
};

const curlEx = workout.exercises?.find((e) => e.title === "Bicep Curl (Dumbbell)");
if (!curlEx?.sets || curlEx.sets.length < 2) {
  console.error("Bicep curl exercise not found or missing sets");
  process.exit(1);
}

const before = curlEx.sets.map((s) => ({ weight_kg: s.weight_kg, reps: s.reps }));
curlEx.sets[1]!.weight_kg = 15;
curlEx.sets[1]!.reps = 12;

const putBody = {
  workout: {
    title: workout.title,
    description: workout.description?.trim() ? workout.description : null,
    start_time: workout.start_time,
    end_time: workout.end_time,
    is_private: false,
    exercises: workout.exercises!.map((ex) => ({
      exercise_template_id: ex.exercise_template_id,
      superset_id: ex.superset_id ?? null,
      notes: ex.notes?.trim() ? ex.notes : null,
      sets: ex.sets!.map((s) => ({
        type: s.type ?? "normal",
        weight_kg: s.weight_kg ?? null,
        reps: s.reps ?? null,
        distance_meters: s.distance_meters ?? null,
        duration_seconds: s.duration_seconds ?? null,
        rpe: s.rpe ?? null,
        custom_metric: s.custom_metric ?? null,
      })),
    })),
  },
};

const putRes = await fetch(`${base}/v1/workouts/${WORKOUT_ID}`, {
  method: "PUT",
  headers: {
    "api-key": apiKey,
    Accept: "application/json",
    "Content-Type": "application/json",
  },
  body: JSON.stringify(putBody),
});

const putText = await putRes.text();
if (!putRes.ok) {
  console.log(JSON.stringify({ success: false, status: putRes.status, error: putText }));
  process.exit(1);
}

// Verify
const verifyRes = await fetch(`${base}/v1/workouts/${WORKOUT_ID}`, {
  headers: { "api-key": apiKey, Accept: "application/json" },
});
const verified = (await verifyRes.json()) as { exercises?: typeof workout.exercises };
const curlAfter = (verified.workout as typeof workout | undefined)?.exercises?.find(
  (e) => e.title === "Bicep Curl (Dumbbell)",
) ?? verified.exercises?.find((e) => e.title === "Bicep Curl (Dumbbell)");

console.log(
  JSON.stringify({
    success: true,
    workout_id: WORKOUT_ID,
    bicep_curl_before: before,
    bicep_curl_after: curlAfter?.sets?.map((s) => ({ weight_kg: s.weight_kg, reps: s.reps })),
  }, null, 2),
);
