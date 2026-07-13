import type { HevyRoutine, HevyWorkout, HevyWorkoutExercise } from "./types.js";

function exerciseHeadline(ex: HevyWorkoutExercise): string {
  const title = ex.title?.trim() || "Exercise";
  const sets = ex.sets?.length;
  if (sets && sets > 0) {
    return `${title} (${sets} sets)`;
  }
  return title;
}

/**
 * Compact lines for the fitness agent: dates, titles, and a short exercise summary per session.
 */
export function formatHevyWorkoutsForPrompt(workouts: HevyWorkout[]): string {
  if (!workouts.length) {
    return "";
  }
  const lines = workouts.map((w) => {
    const when = w.start_time?.slice(0, 10) ?? "?";
    const name = w.title?.trim() || "Workout";
    const ex = w.exercises ?? [];
    const head = ex
      .slice(0, 4)
      .map((e) => exerciseHeadline(e))
      .join("; ");
    const more = ex.length > 4 ? `; +${ex.length - 4} more` : "";
    return `- ${when} — ${name}${head ? `: ${head}${more}` : ""}`;
  });
  return `Recent Hevy sessions (newest first):\n${lines.join("\n")}`;
}

export function formatHevyRoutinesForPrompt(routines: HevyRoutine[]): string {
  if (!routines.length) {
    return "";
  }
  const titles = routines.map((r) => r.title?.trim() || "Routine").join("; ");
  return `Saved Hevy routines (templates) on this account: ${titles}`;
}
