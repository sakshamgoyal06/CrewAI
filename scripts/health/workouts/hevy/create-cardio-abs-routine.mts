/**
 * createRoutine only — Cardio + Abs + Conditioning (no reads).
 */
import "dotenv/config";
import { createHevyRoutine } from "../../../../src/pillars/health/workouts/hevy/hevyClient.js";
import { hevyApiKeyFromEnv } from "../../../../src/pillars/health/workouts/hevy/hevyEnv.js";
import type { HevyPostRoutineBody } from "../../../../src/pillars/health/workouts/hevy/types.js";

const apiKey = hevyApiKeyFromEnv();
if (!apiKey) {
  console.error("Missing HEVY_API_KEY");
  process.exit(1);
}

const payload: HevyPostRoutineBody = {
  routine: {
    title: "Cardio + Abs + Conditioning",
    folder_id: 3206984,
    notes: `Wednesday conditioning and core day.

Purpose:
- Easy cardio
- Extra calorie burn
- Core training
- Light conditioning
- Recovery-friendly movement

This is not a main strength-progression day.

Important constraints:
- No heavy loading.
- No failure sets.
- Normal sets only.`,
    exercises: [
      {
        exercise_template_id: "243710DE",
        notes: `25 minutes incline treadmill walking.
Moderate sustainable pace.
Keep breathing controlled.
This should feel like productive cardio, not punishment.
Do not treat this as a strength-progression exercise.`,
        sets: [{ type: "normal", duration_seconds: 1500 }],
      },
      {
        exercise_template_id: "991833C2",
        rest_seconds: 45,
        notes: `5 sets of 45 seconds.
Keep rhythm smooth.
Stay light on the feet.
If knees or ankles feel uncomfortable, replace with brisk walking or step-ups.
This is conditioning, not failure training.`,
        sets: Array.from({ length: 5 }, () => ({
          type: "normal" as const,
          duration_seconds: 45,
        })),
      },
      {
        exercise_template_id: "128A2381",
        rest_seconds: 60,
        notes: `3 controlled sets of 12–15 each leg.
Use bodyweight only initially.
Step through the full foot.
Control the descent.
Keep it easy and smooth.
If no step or box is available, replace with bodyweight squats.`,
        sets: [
          { type: "normal", rep_range: { start: 12, end: 15 } },
          { type: "normal", rep_range: { start: 12, end: 15 } },
          { type: "normal", rep_range: { start: 12, end: 15 } },
        ],
      },
      {
        exercise_template_id: "DCF3B31B",
        rest_seconds: 60,
        notes: `3 controlled sets of 12–15.
Curl ribs toward pelvis.
Do not pull the neck.
Pause briefly at the top.
Progress by improving control before adding difficulty.`,
        sets: [
          { type: "normal", rep_range: { start: 12, end: 15 } },
          { type: "normal", rep_range: { start: 12, end: 15 } },
          { type: "normal", rep_range: { start: 12, end: 15 } },
        ],
      },
      {
        exercise_template_id: "7952B5CD",
        rest_seconds: 60,
        notes: `3 controlled sets of 12–15.
Tilt pelvis upward.
Do not swing the legs.
Control the lowering phase.
Keep lower back stable.`,
        sets: [
          { type: "normal", rep_range: { start: 12, end: 15 } },
          { type: "normal", rep_range: { start: 12, end: 15 } },
          { type: "normal", rep_range: { start: 12, end: 15 } },
        ],
      },
      {
        exercise_template_id: "C6C9B8A0",
        rest_seconds: 60,
        notes: `3 controlled holds of 30–45 seconds.
Keep ribs down.
Squeeze glutes lightly.
Do not let lower back sag.
Stop the set when form breaks.`,
        sets: [
          { type: "normal", duration_seconds: 45 },
          { type: "normal", duration_seconds: 45 },
          { type: "normal", duration_seconds: 45 },
        ],
      },
    ],
  },
};

const result = await createHevyRoutine(apiKey, payload);
if (!result.ok) {
  console.log(JSON.stringify({ success: false, status: result.status ?? null, error: result.error }));
  process.exit(1);
}

console.log(
  JSON.stringify({
    success: true,
    routine_id: result.routine.id,
    title: result.routine.title ?? payload.routine.title,
    folder_id: payload.routine.folder_id,
  }),
);
