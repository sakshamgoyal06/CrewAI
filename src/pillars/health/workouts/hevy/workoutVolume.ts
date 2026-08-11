import type { HevyWorkout, HevyWorkoutSet } from "./types.js";

const WORKING_SET_TYPES = new Set(["normal", "failure", "dropset"]);

function isWorkingSet(set: HevyWorkoutSet): boolean {
  const t = (set.type ?? "normal").toLowerCase();
  if (t === "warmup") {
    return false;
  }
  return WORKING_SET_TYPES.has(t) || t === "normal";
}

/** Tonnage for one set: weight_kg × reps (0 when bodyweight or cardio). */
export function setTonnageKg(set: HevyWorkoutSet): number {
  if (!isWorkingSet(set)) {
    return 0;
  }
  const weight = set.weight_kg;
  const reps = set.reps;
  if (weight == null || reps == null || weight <= 0 || reps <= 0) {
    return 0;
  }
  return weight * reps;
}

/** Sum working-set tonnage for one workout. */
export function computeWorkoutVolumeKg(workout: HevyWorkout): number {
  let total = 0;
  for (const ex of workout.exercises ?? []) {
    for (const set of ex.sets ?? []) {
      total += setTonnageKg(set);
    }
  }
  return Math.round(total);
}

/** Volume for the newest workout in a list (Hevy returns newest first). */
export function computeLatestSessionVolumeKg(workouts: HevyWorkout[]): number | null {
  const latest = workouts[0];
  if (!latest) {
    return null;
  }
  const vol = computeWorkoutVolumeKg(latest);
  return vol > 0 ? vol : null;
}

export function formatSessionVolumeLine(volumeKg: number): string {
  return `Session volume (working sets, computed from Hevy): ${volumeKg.toLocaleString("en-US")} kg`;
}
