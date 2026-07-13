/**
 * Create a recognizable test routine in Hevy for phone validation.
 * Run: npx tsx scripts/create-hevy-test-routine.mts
 */
import "dotenv/config";

import {
  createHevyRoutine,
  fetchHevyExerciseTemplateCatalog,
} from "../../../../src/pillars/health/workouts/hevy/hevyClient.js";
import { hevyApiKeyFromEnv } from "../../../../src/pillars/health/workouts/hevy/hevyEnv.js";

const apiKey = hevyApiKeyFromEnv();
if (!apiKey) {
  console.error("Missing HEVY_API_KEY in .env");
  process.exit(1);
}

const catalog = await fetchHevyExerciseTemplateCatalog(apiKey, { maxPages: 5 });
if (!catalog.ok) {
  console.error("Catalog fetch failed:", catalog.error);
  process.exit(1);
}

function find(pattern: RegExp) {
  return catalog.templates.find((t) => pattern.test(t.title));
}

const plan = [
  {
    label: "Bench Press",
    match: /bench press.*barbell/i,
    sets: [
      { type: "normal" as const, reps: 10 },
      { type: "normal" as const, reps: 8 },
      { type: "normal" as const, reps: 6 },
    ],
  },
  {
    label: "Squat",
    match: /squat.*barbell/i,
    sets: [
      { type: "warmup" as const, reps: 10 },
      { type: "normal" as const, reps: 8 },
      { type: "normal" as const, reps: 8 },
    ],
  },
  {
    label: "Row",
    match: /barbell row|bent over row/i,
    sets: [
      { type: "normal" as const, reps: 10 },
      { type: "normal" as const, reps: 10 },
    ],
  },
  {
    label: "Overhead Press",
    match: /overhead press|shoulder press.*barbell/i,
    sets: [
      { type: "normal" as const, reps: 8 },
      { type: "normal" as const, reps: 8 },
    ],
  },
];

const picked: {
  exercise_template_id: string;
  title: string;
  rest_seconds: number;
  sets: (typeof plan)[0]["sets"];
}[] = [];

for (const ex of plan) {
  const t = find(ex.match);
  if (t) {
    picked.push({
      exercise_template_id: t.id,
      title: t.title,
      rest_seconds: 90,
      sets: ex.sets,
    });
  }
}

if (picked.length === 0) {
  const fallback = catalog.templates[0];
  if (!fallback) {
    console.error("No exercise templates in catalog.");
    process.exit(1);
  }
  picked.push({
    exercise_template_id: fallback.id,
    title: fallback.title,
    rest_seconds: 90,
    sets: [{ type: "normal", reps: 10 }],
  });
}

const title = "Magnus Test Routine";
const created = await createHevyRoutine(apiKey, {
  routine: {
    title,
    folder_id: null,
    notes:
      "Test routine from Magnus — open Routines on your phone to validate. Safe to delete afterward.",
    exercises: picked.map(({ exercise_template_id, rest_seconds, sets }) => ({
      exercise_template_id,
      rest_seconds,
      sets,
    })),
  },
});

if (!created.ok) {
  console.error(`Create failed (${created.status ?? "?"}):`, created.error);
  process.exit(1);
}

console.log("Created in Hevy:");
console.log(`  Title: ${created.routine.title ?? title}`);
console.log(`  ID:    ${created.routine.id}`);
console.log("  Exercises:");
for (const ex of picked) {
  console.log(`    - ${ex.title} (${ex.sets.length} sets)`);
}
console.log("\nOpen the Hevy app → Routines → look for “Magnus Test Routine”.");
