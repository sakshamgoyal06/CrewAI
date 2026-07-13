/** Subset of Hevy OpenAPI `Workout` / list responses — https://api.hevyapp.com/docs/ */

export type HevyWorkoutSet = {
  index?: number;
  type?: string;
  weight_kg?: number | null;
  reps?: number | null;
  duration_seconds?: number | null;
  distance_meters?: number | null;
};

export type HevyWorkoutExercise = {
  index?: number;
  title?: string;
  notes?: string;
  exercise_template_id?: string;
  sets?: HevyWorkoutSet[];
};

export type HevyWorkout = {
  id?: string;
  title?: string;
  description?: string;
  start_time?: string;
  end_time?: string;
  routine_id?: string;
  exercises?: HevyWorkoutExercise[];
};

export type HevyWorkoutsPage = {
  page?: number;
  page_count?: number;
  workouts?: HevyWorkout[];
};

export type HevyRoutine = {
  id?: string;
  title?: string;
  folder_id?: number | null;
};

export type HevyRoutinesPage = {
  page?: number;
  page_count?: number;
  routines?: HevyRoutine[];
};

export type HevyExerciseTemplateBrief = {
  id: string;
  title: string;
};

export type HevyExerciseTemplatesPage = {
  page?: number;
  page_count?: number;
  exercise_templates?: {
    id?: string;
    title?: string;
  }[];
};

/** POST /v1/routines — OpenAPI `PostRoutinesRequestBody` */
export type HevyRoutineSetInput = {
  type?: "warmup" | "normal" | "failure" | "dropset";
  weight_kg?: number | null;
  reps?: number | null;
  distance_meters?: number | null;
  duration_seconds?: number | null;
  custom_metric?: number | null;
  rep_range?: { start?: number | null; end?: number | null } | null;
};

export type HevyRoutineExerciseInput = {
  exercise_template_id: string;
  superset_id?: number | null;
  rest_seconds?: number | null;
  notes?: string | null;
  sets: HevyRoutineSetInput[];
};

export type HevyPostRoutineBody = {
  routine: {
    title: string;
    folder_id?: number | null;
    notes?: string | null;
    exercises: HevyRoutineExerciseInput[];
  };
};

/** POST /v1/workouts — OpenAPI `PostWorkoutsRequestBody` */
export type HevyWorkoutSetInput = {
  type?: "warmup" | "normal" | "failure" | "dropset";
  weight_kg?: number | null;
  reps?: number | null;
  distance_meters?: number | null;
  duration_seconds?: number | null;
  custom_metric?: number | null;
  rpe?: 6 | 7 | 7.5 | 8 | 8.5 | 9 | 9.5 | 10 | null;
};

export type HevyWorkoutExerciseInput = {
  exercise_template_id: string;
  superset_id?: number | null;
  notes?: string | null;
  sets: HevyWorkoutSetInput[];
};

export type HevyPostWorkoutBody = {
  workout: {
    title: string;
    description?: string | null;
    start_time: string;
    end_time: string;
    is_private?: boolean;
    exercises: HevyWorkoutExerciseInput[];
  };
};
