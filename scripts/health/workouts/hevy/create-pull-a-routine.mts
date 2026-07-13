/**
 * createRoutine only — Pull A (no reads).
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
    title: "Pull A",
    folder_id: 3206984,
    notes: `Primary: Back Width
Secondary: Biceps and Rear Delts

This is a main strength day.

Program rules:
- Compound exercises: 3 working sets of 8–10 reps.
- Isolation exercises: 3 working sets of 12–15 reps.
- Abs: 3 controlled sets of 12–15 reps.
- Finish with 20 minutes incline treadmill walking.
- Progress compounds only after clean 10/10/10.
- Progress isolations only after clean 15/15/15.
- Otherwise retain weight and improve total reps or execution.
- Starting weight should be unset for all exercises.
- Do not add warm-up sets for now.
- Do not prescribe failure sets in the routine. Use normal sets only.`,
    exercises: [
      {
        exercise_template_id: "6A6C31A5",
        rest_seconds: 150,
        notes: `3 working sets of 8–10.
Progress after clean 10/10/10.
Pull elbows down toward ribs.
Keep chest tall.
Do not turn it into a row.
Control the stretch at the top.`,
        sets: [
          { type: "normal", rep_range: { start: 8, end: 10 } },
          { type: "normal", rep_range: { start: 8, end: 10 } },
          { type: "normal", rep_range: { start: 8, end: 10 } },
        ],
      },
      {
        exercise_template_id: "2C37EC5E",
        rest_seconds: 150,
        notes: `3 working sets of 8–10.
Progress after clean 10/10/10.
Use controlled full-range reps.
Avoid kicking or swinging.
Reduce assistance over time after hitting the top of the rep range.`,
        sets: [
          { type: "normal", rep_range: { start: 8, end: 10 } },
          { type: "normal", rep_range: { start: 8, end: 10 } },
          { type: "normal", rep_range: { start: 8, end: 10 } },
        ],
      },
      {
        exercise_template_id: "2EE45F81",
        rest_seconds: 120,
        notes: `3 working sets of 8–10 each side.
Progress after clean 10/10/10.
Pull elbow down and slightly back.
Keep torso stable.
Do not twist to move the weight.
Match reps on both sides.`,
        sets: [
          { type: "normal", rep_range: { start: 8, end: 10 } },
          { type: "normal", rep_range: { start: 8, end: 10 } },
          { type: "normal", rep_range: { start: 8, end: 10 } },
        ],
      },
      {
        exercise_template_id: "8BAB2735",
        rest_seconds: 75,
        notes: `3 working sets of 12–15.
Progress after clean 15/15/15.
Keep upper arms back.
Full stretch at the bottom.
Avoid swinging.
Final set may approach technical failure.`,
        sets: [
          { type: "normal", rep_range: { start: 12, end: 15 } },
          { type: "normal", rep_range: { start: 12, end: 15 } },
          { type: "normal", rep_range: { start: 12, end: 15 } },
        ],
      },
      {
        exercise_template_id: "7E3BC8B6",
        rest_seconds: 75,
        notes: `3 working sets of 12–15.
Progress after clean 15/15/15.
Keep wrists neutral.
Do not swing the dumbbells.
Control the lowering phase.
Final set may approach technical failure.`,
        sets: [
          { type: "normal", rep_range: { start: 12, end: 15 } },
          { type: "normal", rep_range: { start: 12, end: 15 } },
          { type: "normal", rep_range: { start: 12, end: 15 } },
        ],
      },
      {
        exercise_template_id: "D8281C62",
        rest_seconds: 75,
        notes: `3 working sets of 12–15.
Progress after clean 15/15/15.
Lead with elbows.
Keep traps relaxed.
Pause briefly at peak contraction.
Do not use momentum.`,
        sets: [
          { type: "normal", rep_range: { start: 12, end: 15 } },
          { type: "normal", rep_range: { start: 12, end: 15 } },
          { type: "normal", rep_range: { start: 12, end: 15 } },
        ],
      },
      {
        exercise_template_id: "BE640BA0",
        rest_seconds: 60,
        notes: `3 working sets of 12–15.
Progress after clean 15/15/15.
Pull rope toward face.
Elbows high.
Externally rotate slightly at the end.
Do not overload at the cost of form.`,
        sets: [
          { type: "normal", rep_range: { start: 12, end: 15 } },
          { type: "normal", rep_range: { start: 12, end: 15 } },
          { type: "normal", rep_range: { start: 12, end: 15 } },
        ],
      },
      {
        exercise_template_id: "99D5F10E",
        rest_seconds: 60,
        notes: `3 controlled sets of 12–15.
Keep ribs down.
Do not let lower back sag.
Use shorter range if needed.
Increase range before adding difficulty.`,
        sets: [
          { type: "normal", rep_range: { start: 12, end: 15 } },
          { type: "normal", rep_range: { start: 12, end: 15 } },
          { type: "normal", rep_range: { start: 12, end: 15 } },
        ],
      },
      {
        exercise_template_id: "09C9F635",
        rest_seconds: 60,
        notes: `3 controlled sets of 12–15.
Avoid swinging.
Control the lowering phase.
Keep lower back stable.
Progress after clean 15/15/15.`,
        sets: [
          { type: "normal", rep_range: { start: 12, end: 15 } },
          { type: "normal", rep_range: { start: 12, end: 15 } },
          { type: "normal", rep_range: { start: 12, end: 15 } },
        ],
      },
      {
        exercise_template_id: "243710DE",
        notes: `20 minutes incline treadmill walking.
Moderate sustainable effort.
This is not a strength-progression exercise.`,
        sets: [{ type: "normal", duration_seconds: 1200 }],
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
