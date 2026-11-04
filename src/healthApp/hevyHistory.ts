/**
 * One cached copy of the last few weeks of Hevy workouts, shared by the tracker's history view and
 * the lift analysis, so opening the tracker costs one round of Hevy requests, not two.
 */
import type { HevyWorkout } from "../pillars/health/workouts/hevy/index.js";
import { hevyKey, loadWorkoutHistory } from "./training.js";

/** Enough for the 12-week Progress view; the lift analysis still reads its own 8 weeks. */
export const HEVY_HISTORY_WEEKS = 12;
export const TRAINING_ANALYSIS_WEEKS = 8;
const CACHE_MS = 10 * 60_000;

type Entry = { at: number; workouts: HevyWorkout[] };
const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<HevyHistory>>();

export type HevyHistory =
  | { connected: false }
  | { connected: true; ok: true; workouts: HevyWorkout[] }
  | { connected: true; ok: false; error: string };

export async function hevyHistoryCached(
  userProfileId: string,
  opts: { fresh?: boolean; now?: Date } = {},
): Promise<HevyHistory> {
  const hit = cache.get(userProfileId);
  if (!opts.fresh && hit && Date.now() - hit.at < CACHE_MS) {
    return { connected: true, ok: true, workouts: hit.workouts };
  }
  // The tracker asks for history and training at the same moment; share one fetch.
  const running = inflight.get(userProfileId);
  if (running) return running;
  const p = (async (): Promise<HevyHistory> => {
    const apiKey = await hevyKey(userProfileId);
    if (!apiKey) return { connected: false };
    const h = await loadWorkoutHistory(apiKey, opts.now ?? new Date(), HEVY_HISTORY_WEEKS);
    if (!h.ok) return { connected: true, ok: false, error: h.error };
    cache.set(userProfileId, { at: Date.now(), workouts: h.workouts });
    return { connected: true, ok: true, workouts: h.workouts };
  })().finally(() => inflight.delete(userProfileId));
  inflight.set(userProfileId, p);
  return p;
}

/** After a write to Hevy, the next read should see it. */
export function invalidateHevyHistory(userProfileId: string): void {
  cache.delete(userProfileId);
}
