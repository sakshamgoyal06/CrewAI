/**
 * Meal anomaly flags written to `meal_daily_rollups.flags`.
 */
import type { MealSlot } from "../types.js";

export const MEAL_ANOMALY_FLAGS = [
  "logging_gap",
  "slot_habitually_missed",
  "calorie_spike",
  "protein_low",
  "plan_drift",
  "estimate_unavailable",
] as const;

export type MealAnomalyFlag = (typeof MEAL_ANOMALY_FLAGS)[number];

export type RollupHistoryRow = {
  localDate: string;
  calories: number;
  protein_g: number;
  mealCount: number;
  snackCount: number;
  slotsMissed: string[];
  flags: string[];
};

export type AnomalyDetectorInput = {
  localDate: string;
  calories: number;
  protein_g: number;
  mealCount: number;
  snackCount: number;
  slotsLogged: MealSlot[];
  slotsMissed: Exclude<MealSlot, "unspecified">[];
  adherenceScore: number | null;
  slotsPlannedCount: number;
  hasUnavailableEstimate: boolean;
  targetCalories: number | null;
  targetProtein_g: number | null;
  recentRollups: RollupHistoryRow[];
};

const LOGGING_GAP_MIN_ACTIVE_DAYS = 3;
const LOGGING_GAP_LOOKBACK_DAYS = 7;
const PROTEIN_LOW_RATIO = 0.7;
const PROTEIN_LOW_WINDOW_DAYS = 3;
const CALORIE_SPIKE_RATIO = 1.3;
const PLAN_DRIFT_MIN_PLANNED = 2;
const PLAN_DRIFT_MAX_ADHERENCE = 0.5;
const HABITUAL_MISS_MIN_DAYS = 5;
const HABITUAL_MISS_LOOKBACK_DAYS = 7;

function totalLogCount(mealCount: number, snackCount: number): number {
  return mealCount + snackCount;
}

function priorRollups(input: AnomalyDetectorInput): RollupHistoryRow[] {
  return input.recentRollups.filter((r) => r.localDate < input.localDate);
}

export function detectMealAnomalies(input: AnomalyDetectorInput): MealAnomalyFlag[] {
  const flags = new Set<MealAnomalyFlag>();
  const logsToday = totalLogCount(input.mealCount, input.snackCount);

  if (input.hasUnavailableEstimate) {
    flags.add("estimate_unavailable");
  }

  if (input.targetProtein_g != null && input.targetProtein_g > 0) {
    const proteinByDate = new Map<string, number>();
    proteinByDate.set(input.localDate, input.protein_g);
    for (const row of input.recentRollups) {
      if (row.localDate <= input.localDate) {
        proteinByDate.set(row.localDate, row.protein_g);
      }
    }

    const windowDates = Array.from({ length: PROTEIN_LOW_WINDOW_DAYS }, (_, i) =>
      offsetDateKey(input.localDate, -i),
    );
    const windowValues = windowDates
      .map((date) => proteinByDate.get(date))
      .filter((v): v is number => v !== undefined);

    if (windowValues.length >= PROTEIN_LOW_WINDOW_DAYS) {
      const avgProtein = windowValues.reduce((sum, v) => sum + v, 0) / windowValues.length;
      if (avgProtein < input.targetProtein_g * PROTEIN_LOW_RATIO) {
        flags.add("protein_low");
      }
    }
  }

  if (
    input.targetCalories != null &&
    input.targetCalories > 0 &&
    input.calories > input.targetCalories * CALORIE_SPIKE_RATIO
  ) {
    flags.add("calorie_spike");
  }

  if (
    input.adherenceScore !== null &&
    input.slotsPlannedCount >= PLAN_DRIFT_MIN_PLANNED &&
    input.adherenceScore < PLAN_DRIFT_MAX_ADHERENCE
  ) {
    flags.add("plan_drift");
  }

  if (logsToday === 0) {
    const prior = priorRollups(input)
      .slice(-LOGGING_GAP_LOOKBACK_DAYS)
      .filter((r) => totalLogCount(r.mealCount, r.snackCount) > 0);
    if (prior.length >= LOGGING_GAP_MIN_ACTIVE_DAYS) {
      flags.add("logging_gap");
    }
  }

  if (input.slotsMissed.length > 0) {
    const lookback = priorRollups(input).slice(-HABITUAL_MISS_LOOKBACK_DAYS);
    for (const slot of input.slotsMissed) {
      let missDays = 1;
      for (const row of lookback) {
        if (row.slotsMissed.includes(slot)) {
          missDays += 1;
        }
      }
      if (missDays >= HABITUAL_MISS_MIN_DAYS) {
        flags.add("slot_habitually_missed");
        break;
      }
    }
  }

  return MEAL_ANOMALY_FLAGS.filter((f) => flags.has(f));
}

/** UTC date arithmetic for YYYY-MM-DD keys (same helper as meal plan). */
export function offsetDateKey(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split("-").map((x) => Number.parseInt(x, 10));
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}
