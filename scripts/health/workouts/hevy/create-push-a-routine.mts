/**
 * Create Push A routine from user payload (resolves folder, validates templates).
 */
import "dotenv/config";

import { createHevyRoutine, fetchHevyExerciseTemplateCatalog, hevyApiBaseUrl } from "../../../../src/pillars/health/workouts/hevy/hevyClient.js";
import { hevyApiKeyFromEnv } from "../../../../src/pillars/health/workouts/hevy/hevyEnv.js";
import type { HevyPostRoutineBody } from "../../../../src/pillars/health/workouts/hevy/types.js";

const apiKey = hevyApiKeyFromEnv();
if (!apiKey) {
  console.error("Missing HEVY_API_KEY");
  process.exit(1);
}

const payload: HevyPostRoutineBody = {
  routine: {
    title: "Push A",
    folder_id: null,
    notes:
      "Primary: Chest\nSecondary: Shoulders and Triceps\n\nCompounds use 3 working sets of 8–10 reps.\nIncrease weight only after a clean 10/10/10.\nIsolation exercises use 3 working sets of 12–15 reps.\nIncrease weight only after a clean 15/15/15.\nEarly sets should generally stop with 1–2 RIR.\nFinal isolation sets may reach technical failure.\nFinish with 20 minutes of incline treadmill walking.",
    exercises: [
      {
        exercise_template_id: "07B38369",
        rest_seconds: 180,
        notes:
          "Compound. Intended range: 8–10. Controlled eccentric. Progress after clean 10/10/10.",
        sets: [
          { type: "normal", reps: 8 },
          { type: "normal", reps: 8 },
          { type: "normal", reps: 8 },
        ],
      },
      {
        exercise_template_id: "7EB3F7C3",
        rest_seconds: 150,
        notes:
          "Compound. Intended range: 8–10. Stable shoulder blades. Progress after clean 10/10/10.",
        sets: [
          { type: "normal", reps: 8 },
          { type: "normal", reps: 8 },
          { type: "normal", reps: 8 },
        ],
      },
      {
        exercise_template_id: "651F844C",
        rest_seconds: 75,
        notes:
          "Isolation. Use a standard mid-height cable path. Intended range: 12–15. Controlled stretch. Progress after clean 15/15/15.",
        sets: [
          { type: "normal", reps: 12 },
          { type: "normal", reps: 12 },
          { type: "normal", reps: 12 },
        ],
      },
      {
        exercise_template_id: "9930DF71",
        rest_seconds: 150,
        notes:
          "Compound. Intended range: 8–10. Avoid excessive lower-back arch. Progress after 10/10/10.",
        sets: [
          { type: "normal", reps: 8 },
          { type: "normal", reps: 8 },
          { type: "normal", reps: 8 },
        ],
      },
      {
        exercise_template_id: "DE68C825",
        rest_seconds: 60,
        notes:
          "Isolation. Intended range: 12–15. Lead with the elbow and avoid swinging.",
        sets: [
          { type: "normal", reps: 12 },
          { type: "normal", reps: 12 },
          { type: "normal", reps: 12 },
        ],
      },
      {
        exercise_template_id: "4B4BF8C2",
        rest_seconds: 120,
        notes:
          "Compound. Intended range: 8–10. Upright torso for triceps emphasis. Progress after 10/10/10.",
        sets: [
          { type: "normal", reps: 8 },
          { type: "normal", reps: 8 },
          { type: "normal", reps: 8 },
        ],
      },
      {
        exercise_template_id: "B5EFBF9C",
        rest_seconds: 75,
        notes:
          "Isolation. Intended range: 12–15. Keep upper arms fixed. Progress after 15/15/15.",
        sets: [
          { type: "normal", reps: 12 },
          { type: "normal", reps: 12 },
          { type: "normal", reps: 12 },
        ],
      },
      {
        exercise_template_id: "23A48484",
        rest_seconds: 60,
        notes:
          "Abs. Intended range: 12–15 controlled reps. Flex the spine rather than pulling with the arms.",
        sets: [
          { type: "normal", reps: 12 },
          { type: "normal", reps: 12 },
          { type: "normal", reps: 12 },
        ],
      },
      {
        exercise_template_id: "08590920",
        rest_seconds: 60,
        notes:
          "Abs. Intended range: 12–15 controlled reps. Avoid swinging and control the lowering phase.",
        sets: [
          { type: "normal", reps: 12 },
          { type: "normal", reps: 12 },
          { type: "normal", reps: 12 },
        ],
      },
      {
        exercise_template_id: "243710DE",
        notes: "Incline walk at a sustainable moderate intensity.",
        sets: [{ type: "normal", duration_seconds: 1200 }],
      },
    ],
  },
};

const base = hevyApiBaseUrl().replace(/\/$/, "");
const folderRes = await fetch(`${base}/v1/routine_folders?page=1&pageSize=10`, {
  headers: { "api-key": apiKey, Accept: "application/json" },
});
const folderJson = (await folderRes.json()) as {
  routine_folders?: { id: number; title?: string }[];
  routines?: unknown;
  error?: string;
};
const folders = folderJson.routine_folders ?? [];
console.log(
  "Routine folders:",
  folders.map((f) => `${f.id}: ${f.title ?? "(no title)"}`).join(", ") || "(none)",
);

const trainingOs = folders.find((f) =>
  /saksham|training\s*os/i.test(f.title ?? ""),
);
if (trainingOs) {
  payload.routine.folder_id = trainingOs.id;
  console.log(`Using folder_id=${trainingOs.id} (${trainingOs.title})`);
} else if (folders.length > 0) {
  console.warn("SAKSHAM_TRAINING_OS folder not found; using folder_id=null");
  payload.routine.folder_id = null;
} else {
  payload.routine.folder_id = null;
}

const catalog = await fetchHevyExerciseTemplateCatalog(apiKey, { maxPages: 20 });
if (!catalog.ok) {
  console.error("Catalog fetch failed:", catalog.error);
  process.exit(1);
}
const byId = new Map(catalog.templates.map((t) => [t.id, t.title]));
const missing: string[] = [];
for (const ex of payload.routine.exercises) {
  const title = byId.get(ex.exercise_template_id);
  if (!title) {
    missing.push(ex.exercise_template_id);
  } else {
    console.log(`  ✓ ${ex.exercise_template_id} → ${title}`);
  }
}
if (missing.length > 0) {
  console.error("Missing template IDs:", missing.join(", "));
  process.exit(1);
}

console.log("\nCreating routine…");
const created = await createHevyRoutine(apiKey, payload);
if (!created.ok) {
  console.error(`Failed (${created.status ?? "?"}):`, created.error);
  process.exit(1);
}

console.log("\nCreated Push A:");
console.log(`  ID:    ${created.routine.id}`);
console.log(`  Title: ${created.routine.title ?? payload.routine.title}`);
console.log(`  Folder: ${payload.routine.folder_id ?? "null (root)"}`);
