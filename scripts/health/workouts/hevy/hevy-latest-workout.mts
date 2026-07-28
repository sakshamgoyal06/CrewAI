/**
 * Fetch latest Hevy workout with full details.
 */
import "dotenv/config";

import {
  fetchHevyWorkoutById,
  fetchHevyWorkoutsPage,
} from "../../../../src/pillars/health/workouts/hevy/hevyClient.js";
import { hevyApiKeyFromEnv } from "../../../../src/pillars/health/workouts/hevy/hevyEnv.js";

const apiKey = hevyApiKeyFromEnv();
if (!apiKey) process.exit(1);

const list = await fetchHevyWorkoutsPage(apiKey, 1, 5);
if (!list.ok) {
  console.error(list.error);
  process.exit(1);
}

const workouts = list.data.workouts ?? [];
if (!workouts.length) {
  console.log(JSON.stringify({ error: "no_workouts" }));
  process.exit(0);
}

const latest = workouts[0]!;
let full = latest;
if (latest.id) {
  const detail = await fetchHevyWorkoutById(apiKey, latest.id);
  if (detail.ok) {
    full = detail.workout;
  }
}

console.log(JSON.stringify(full, null, 2));
