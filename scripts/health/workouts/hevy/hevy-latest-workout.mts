/**
 * Fetch latest Hevy workout with full details.
 */
import "dotenv/config";

import { fetchHevyWorkoutsPage, hevyApiBaseUrl } from "../../../../src/pillars/health/workouts/hevy/hevyClient.js";
import { hevyApiKeyFromEnv } from "../../../../src/pillars/health/workouts/hevy/hevyEnv.js";
import type { HevyWorkout } from "../../../../src/pillars/health/workouts/hevy/types.js";

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
const base = hevyApiBaseUrl().replace(/\/$/, "");

let full: HevyWorkout = latest;
if (latest.id) {
  const res = await fetch(`${base}/v1/workouts/${encodeURIComponent(latest.id)}`, {
    headers: { "api-key": apiKey, Accept: "application/json" },
  });
  if (res.ok) {
    const data = (await res.json()) as { workout?: HevyWorkout } | HevyWorkout;
    full = ("workout" in data && data.workout ? data.workout : data) as HevyWorkout;
  }
}

console.log(JSON.stringify(full, null, 2));
