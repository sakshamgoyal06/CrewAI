/**
 * Meal-specific data for proactive evaluation and Morning Brief.
 */
import { loadDailyTargets } from "../meals/mealDaySummary.js";
import { localDateKey } from "./localDate.js";
import { offsetDateKey } from "./parseMealPlanJson.js";
import { getPlanEntriesForDate } from "./store/mealPlanStore.js";
import { supabase } from "../tools/clients.js";
import { parseMealTimingOverrides, type PlannedMealSlot } from "./mealReminderSchedule.js";

export type MealProactiveSnapshot = {
  mealsLoggedTodaySlots: PlannedMealSlot[];
  plannedSlotsToday: PlannedMealSlot[];
  plannedSlotsMissedToday: PlannedMealSlot[];
  plannedTitlesToday: Record<string, string>;
  caloriesSoFarToday: number;
  proteinSoFarToday: number;
  lastMealLogAt: string | null;
  recentEatingChatWithoutLog: boolean;
  mealTimingNotes: string | null;
  slotHourOverrides: Partial<Record<PlannedMealSlot, number>>;
  yesterdayCalories: number | null;
  yesterdayProtein: number | null;
  yesterdayTargetCalories: number | null;
};

const PLANNED_SLOTS = new Set<PlannedMealSlot>(["breakfast", "lunch", "dinner", "snack"]);

function isPlannedSlot(v: unknown): v is PlannedMealSlot {
  return typeof v === "string" && PLANNED_SLOTS.has(v as PlannedMealSlot);
}

const EATING_MENTION_RE =
  /\b(?:ate|eating|had some|snack|snacking|ordered|delivery|pizza|chips|binge|dessert|cookie|cake|munch|biryani|burger|ice cream)\b/i;

const LOGGED_MENTION_RE = /\b(?:log(?:ged)?\s+(?:meal|lunch|dinner|breakfast|snack)|\/meal|meal:)\b/i;

function num(v: unknown): number {
  if (v === null || v === undefined) {
    return 0;
  }
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function emptyMealProactiveSnapshot(): MealProactiveSnapshot {
  return {
    mealsLoggedTodaySlots: [],
    plannedSlotsToday: [],
    plannedSlotsMissedToday: [],
    plannedTitlesToday: {},
    caloriesSoFarToday: 0,
    proteinSoFarToday: 0,
    lastMealLogAt: null,
    recentEatingChatWithoutLog: false,
    mealTimingNotes: null,
    slotHourOverrides: {},
    yesterdayCalories: null,
    yesterdayProtein: null,
    yesterdayTargetCalories: null,
  };
}

export async function loadMealProactiveSnapshot(input: {
  userProfileId: string;
  timezone: string;
  now: Date;
  recentUserChatSnippet: string;
}): Promise<MealProactiveSnapshot> {
  const today = localDateKey(input.now, input.timezone);
  const yesterday = offsetDateKey(today, -1);

  const [healthProfile, planEntries, todayLogs, yesterdayRollup, targets] = await Promise.all([
    supabase
      .from("user_health_profile")
      .select("meal_timing_notes")
      .eq("user_profile_id", input.userProfileId)
      .maybeSingle(),
    getPlanEntriesForDate(input.userProfileId, today),
    supabase
      .from("meal_logs")
      .select("meal_slot, logged_at, created_at")
      .eq("user_profile_id", input.userProfileId)
      .eq("local_date", today)
      .is("deleted_at", null),
    supabase
      .from("meal_daily_rollups")
      .select("calories, protein_g, target_calories")
      .eq("user_profile_id", input.userProfileId)
      .eq("local_date", yesterday)
      .maybeSingle(),
    loadDailyTargets(input.userProfileId),
  ]);

  const mealTimingNotes =
    (healthProfile.data?.meal_timing_notes as string | null | undefined) ?? null;
  const slotHourOverrides = parseMealTimingOverrides(mealTimingNotes);

  const mealsLoggedTodaySlots = new Set<PlannedMealSlot>();
  let lastMealLogAt: string | null = null;

  for (const row of todayLogs.data ?? []) {
    const slot = row.meal_slot;
    if (isPlannedSlot(slot)) {
      mealsLoggedTodaySlots.add(slot);
    }
    const ts = (row.logged_at as string | null) ?? (row.created_at as string | null);
    if (ts && (!lastMealLogAt || ts > lastMealLogAt)) {
      lastMealLogAt = ts;
    }
  }

  const plannedSlotsToday: PlannedMealSlot[] = [];
  const plannedSlotsMissedToday: PlannedMealSlot[] = [];
  const plannedTitlesToday: Record<string, string> = {};

  for (const entry of planEntries) {
    if (!isPlannedSlot(entry.meal_slot)) {
      continue;
    }
    plannedSlotsToday.push(entry.meal_slot);
    plannedTitlesToday[entry.meal_slot] = entry.title;
    if (entry.status === "planned") {
      plannedSlotsMissedToday.push(entry.meal_slot);
    }
  }

  let caloriesSoFarToday = 0;
  let proteinSoFarToday = 0;
  const { data: rollupToday } = await supabase
    .from("meal_daily_rollups")
    .select("calories, protein_g")
    .eq("user_profile_id", input.userProfileId)
    .eq("local_date", today)
    .maybeSingle();

  if (rollupToday) {
    caloriesSoFarToday = num(rollupToday.calories);
    proteinSoFarToday = num(rollupToday.protein_g);
  }

  const chat = input.recentUserChatSnippet.trim();
  const hoursSinceLastLog = lastMealLogAt
    ? (input.now.getTime() - new Date(lastMealLogAt).getTime()) / (60 * 60 * 1000)
    : Infinity;

  const recentEatingChatWithoutLog =
    EATING_MENTION_RE.test(chat) &&
    !LOGGED_MENTION_RE.test(chat) &&
    hoursSinceLastLog > 0.5;

  return {
    mealsLoggedTodaySlots: [...mealsLoggedTodaySlots],
    plannedSlotsToday,
    plannedSlotsMissedToday,
    plannedTitlesToday,
    caloriesSoFarToday,
    proteinSoFarToday,
    lastMealLogAt,
    recentEatingChatWithoutLog,
    mealTimingNotes,
    slotHourOverrides,
    yesterdayCalories: yesterdayRollup.data ? num(yesterdayRollup.data.calories) : null,
    yesterdayProtein: yesterdayRollup.data ? num(yesterdayRollup.data.protein_g) : null,
    yesterdayTargetCalories:
      yesterdayRollup.data?.target_calories != null
        ? num(yesterdayRollup.data.target_calories)
        : targets?.daily_calorie_target ?? null,
  };
}
