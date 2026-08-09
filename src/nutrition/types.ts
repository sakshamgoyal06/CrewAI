/** Meal slot within a day (for plans, reminders, and log grouping). */
export type MealSlot = "breakfast" | "lunch" | "dinner" | "snack" | "unspecified";

/** Kind of nutrition log entry. */
export type MealLogKind = "meal" | "snack" | "drink" | "supplement" | "correction";

export type MealPlanStatus = "planned" | "logged" | "skipped" | "swapped" | "partial";

export type MealPlanEntryRow = {
  id: string;
  userProfileId: string;
  localDate: string;
  mealSlot: Exclude<MealSlot, "unspecified">;
  title: string;
  description: string | null;
  status: MealPlanStatus;
  linkedMealSessionId: string | null;
  source: string;
};

export type MealDailyRollup = {
  userProfileId: string;
  localDate: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  mealCount: number;
  snackCount: number;
  slotsLogged: MealSlot[];
  targetCalories: number | null;
  targetProtein_g: number | null;
  flags: string[];
};
