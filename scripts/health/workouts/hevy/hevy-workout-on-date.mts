/**
 * Fetch Hevy workout(s) on a given calendar date (UTC date prefix match on start_time).
 *
 * Usage:
 *   npx tsx scripts/health/workouts/hevy/hevy-workout-on-date.mts 2026-07-21
 */
import "dotenv/config";

import {
  fetchHevyWorkoutsPage,
  hevyApiBaseUrl,
} from "../../../../src/pillars/health/workouts/hevy/hevyClient.js";
import { hevyApiKeyFromEnv } from "../../../../src/pillars/health/workouts/hevy/hevyEnv.js";
import type { HevyWorkout } from "../../../../src/pillars/health/workouts/hevy/types.js";

const dateYmd = process.argv[2]?.trim();
if (!dateYmd || !/^\d{4}-\d{2}-\d{2}$/.test(dateYmd)) {
  console.error("Usage: npx tsx scripts/health/workouts/hevy/hevy-workout-on-date.mts YYYY-MM-DD");
  process.exit(1);
}

const apiKey = hevyApiKeyFromEnv();
if (!apiKey) {
  console.error("Missing HEVY_API_KEY in .env");
  process.exit(1);
}

async function fetchWorkoutDetail(id: string): Promise<HevyWorkout | null> {
  const base = hevyApiBaseUrl().replace(/\/$/, "");
  const res = await fetch(`${base}/v1/workouts/${encodeURIComponent(id)}`, {
    headers: { "api-key": apiKey, Accept: "application/json" },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { workout?: HevyWorkout } | HevyWorkout;
  return ("workout" in data && data.workout ? data.workout : data) as HevyWorkout;
}

const matches: HevyWorkout[] = [];

for (let page = 1; page <= 5; page++) {
  const list = await fetchHevyWorkoutsPage(apiKey, page, 10);
  if (!list.ok) {
    console.error(list.error);
    process.exit(1);
  }
  const workouts = list.data.workouts ?? [];
  if (!workouts.length) break;

  for (const w of workouts) {
    const start = w.start_time ?? "";
    if (start.startsWith(dateYmd)) {
      matches.push(w);
    }
  }

  const oldest = workouts[workouts.length - 1]?.start_time ?? "";
  if (oldest && oldest < `${dateYmd}T00:00:00`) {
    break;
  }
  if ((list.data.page_count ?? 1) <= page) break;
}

if (!matches.length) {
  console.log(JSON.stringify({ date: dateYmd, workouts: [] }));
  process.exit(0);
}

const detailed: HevyWorkout[] = [];
for (const w of matches) {
  if (w.id) {
    const full = await fetchWorkoutDetail(w.id);
    detailed.push(full ?? w);
  } else {
    detailed.push(w);
  }
}

console.log(JSON.stringify({ date: dateYmd, workouts: detailed }, null, 2));
