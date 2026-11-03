import type { HevyRoutine, HevyWorkout, HevyWorkoutExercise, HevyWorkoutSet } from "./types.js";

/** Keep prompt blocks bounded while still including full set detail per session. */
export const DEFAULT_HEVY_WORKOUT_CONTEXT_MAX_CHARS = 14_000;

export type FormatHevyWorkoutsOptions = {
  /** Truncate the block at this character limit (whole workouts only). */
  maxChars?: number;
};

function formatSetBrief(set: HevyWorkoutSet): string {
  if (set.duration_seconds != null && set.duration_seconds > 0) {
    const minutes = Math.round(set.duration_seconds / 60);
    return minutes >= 1 ? `${minutes} min` : `${set.duration_seconds}s`;
  }
  if (set.distance_meters != null && set.distance_meters > 0) {
    return `${set.distance_meters}m`;
  }
  const weight = set.weight_kg;
  const reps = set.reps;
  if (weight != null && reps != null) {
    return `${weight}×${reps}`;
  }
  if (reps != null) {
    return `×${reps}`;
  }
  if (weight != null) {
    return `${weight}kg`;
  }
  return "—";
}

function formatExerciseDetail(ex: HevyWorkoutExercise): string {
  const title = ex.title?.trim() || "Exercise";
  const sets = ex.sets ?? [];
  if (!sets.length) {
    return `- ${title}`;
  }
  const setText = sets.map(formatSetBrief).join(", ");
  const notes = ex.notes?.trim();
  return notes ? `- ${title}: ${setText} (${notes})` : `- ${title}: ${setText}`;
}

function formatWorkoutBlock(workout: HevyWorkout): string {
  const when = workout.start_time?.slice(0, 10) ?? "?";
  const name = workout.title?.trim() || "Workout";
  const idSuffix = workout.id ? ` [${workout.id}]` : "";
  const exercises = workout.exercises ?? [];
  const header = `### ${when} — ${name}${idSuffix}`;
  if (!exercises.length) {
    return header;
  }
  return `${header}\n${exercises.map(formatExerciseDetail).join("\n")}`;
}

/**
 * Full session lines for the fitness agent: every exercise with set/rep/weight (or duration).
 * Matches the detail level in EOD journal Hevy sections.
 */
export function formatHevyWorkoutsForPrompt(
  workouts: HevyWorkout[],
  options: FormatHevyWorkoutsOptions = {},
): string {
  if (!workouts.length) {
    return "";
  }

  const maxChars = options.maxChars ?? DEFAULT_HEVY_WORKOUT_CONTEXT_MAX_CHARS;
  const blocks: string[] = [];
  let used = `Recent Hevy sessions (newest first):\n`.length;

  for (const workout of workouts) {
    const block = formatWorkoutBlock(workout);
    const next = blocks.length ? `\n\n${block}` : block;
    if (used + next.length > maxChars) {
      if (blocks.length === 0) {
        blocks.push(`${block.slice(0, Math.max(0, maxChars - used - 20))}\n…[truncated]`);
      } else {
        blocks.push("…[older sessions omitted — ask about a specific date or workout id]");
      }
      break;
    }
    blocks.push(block);
    used += next.length;
  }

  return `Recent Hevy sessions (newest first):\n${blocks.join("\n\n")}`;
}

export function formatHevyRoutinesForPrompt(routines: HevyRoutine[]): string {
  if (!routines.length) {
    return "";
  }
  const titles = routines.map((r) => r.title?.trim() || "Routine").join("; ");
  return `Saved Hevy routines (templates) on this account: ${titles}`;
}
