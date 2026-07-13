/**
 * createRoutine only — Push B, Pull B, Legs (no reads).
 */
import "dotenv/config";
import { readFileSync } from "node:fs";

import { createHevyRoutine } from "../../../../src/pillars/health/workouts/hevy/hevyClient.js";
import { hevyApiKeyFromEnv } from "../../../../src/pillars/health/workouts/hevy/hevyEnv.js";
import type { HevyPostRoutineBody } from "../../../../src/pillars/health/workouts/hevy/types.js";

const apiKey = hevyApiKeyFromEnv();
if (!apiKey) {
  console.error("Missing HEVY_API_KEY");
  process.exit(1);
}

const { payloads } = JSON.parse(readFileSync("/tmp/ppl-preflight.json", "utf8")) as {
  payloads: { pushB: HevyPostRoutineBody; pullB: HevyPostRoutineBody; legs: HevyPostRoutineBody };
};

const order: { key: keyof typeof payloads; label: string }[] = [
  { key: "pushB", label: "Push B" },
  { key: "pullB", label: "Pull B" },
  { key: "legs", label: "Legs" },
];

const results: unknown[] = [];
for (const { key, label } of order) {
  const result = await createHevyRoutine(apiKey, payloads[key]);
  if (!result.ok) {
    results.push({
      title: label,
      success: false,
      status: result.status ?? null,
      error: result.error,
    });
    console.log(JSON.stringify(results, null, 2));
    process.exit(1);
  }
  results.push({
    title: label,
    success: true,
    routine_id: result.routine.id,
    folder_id: payloads[key].routine.folder_id,
  });
}

console.log(JSON.stringify(results, null, 2));
