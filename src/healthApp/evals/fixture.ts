/**
 * A fixed person for tests and evals: vegetarian, no peanuts, 4 weeks into a weight goal, a
 * steady week with protein as the weak spot. Everything the context block and get_status show
 * comes from here, so expected replies can name exact numbers.
 */
import type { HealthSnapshot } from "../snapshot.js";

export const FIXTURE_NOW = new Date("2026-11-03T13:30:00+05:30");
export const FIXTURE_TIMEZONE = "Asia/Kolkata";
export const FIXTURE_DETAILS = "male, born 1996, 176 cm, desk job/day, vegetarian, avoids: peanuts, goal type: lose_fat";

export function fixtureSnapshot(overrides: Partial<HealthSnapshot> = {}): HealthSnapshot {
  const checks = (met: Partial<Record<string, boolean>>) =>
    [
      ["meals_logged", "Meals logged", "1 of 3 meals"],
      ["calories", "Calories", "610 of 1800 kcal"],
      ["protein", "Protein", "28 of 120 g"],
      ["steps", "Steps", "4200 of 8000"],
      ["workout", "Workout", "no Hevy workout yet"],
    ].map(([id, label, detail]) => ({ id: id as never, label: label!, met: met[id!] ?? false, progress: met[id!] ? 1 : 0.4, detail: detail! }));
  const day = (date: string, onTrack: boolean) => ({
    date,
    onTrack,
    score: onTrack ? 100 : 55,
    checks: checks(onTrack ? { meals_logged: true, calories: true, protein: true, steps: true, workout: true } : { meals_logged: true, calories: true }),
  });
  const base: HealthSnapshot = {
    timezone: FIXTURE_TIMEZONE,
    today: {
      date: "2026-11-03",
      onTrack: false,
      score: 40,
      checks: checks({ meals_logged: false }),
      calories: 610,
      proteinG: 28,
      steps: 4200,
      stepsFromPhone: true,
      walkMinutes: null,
      sleepMinutes: 412,
      restingHr: 58,
      totalKcal: null,
      hrvMs: null,
      isTrainingDay: true,
      routine: [
        { itemId: "walk", label: "Morning walk", activityKey: "walking", startTime: "07:00", durationMin: 30, gym: false, state: "done", detail: "Walking · 30 min" },
        { itemId: "gym", label: "Gym", activityKey: "gym", startTime: "18:30", durationMin: 60, gym: true, state: "pending", detail: "6:30 pm" },
      ],
    },
    routine: [
      { id: "walk", activityKey: "walking", label: "Morning walk", days: [0, 1, 2, 3, 4, 5, 6], startTime: "07:00", durationMin: 30, remindBeforeMin: 10, checkAfterMin: 90 },
      { id: "gym", activityKey: "gym", label: "Gym", days: [1, 3, 5], startTime: "18:30", durationMin: 60, remindBeforeMin: 30, checkAfterMin: 180 },
    ] as HealthSnapshot["routine"],
    northStar: {
      onTrackDays: 3,
      unloggedDays: 0,
      partialDays: 0,
      pausedDays: 0,
      windowDays: 7,
      goal: 5,
      days: [day("2026-10-28", true), day("2026-10-29", false), day("2026-10-30", true), day("2026-10-31", false), day("2026-11-01", true), day("2026-11-02", false), day("2026-11-03", false)],
      mostMissed: { id: "protein", label: "Protein", missedDays: 4 },
    },
    targets: { calorieTarget: 1800, proteinTarget: 120, stepTarget: 8000, trainingDays: [1, 3, 5], minMealSessions: 3 },
    workouts: [{ id: "w1", title: "Push day", localDate: "2026-11-01", startTime: "18:40", durationMin: 58, exerciseCount: 6 }],
    hevyConnected: true,
    gym: { time: "18:30", checkDelayMin: 180, checkAt: "21:30" },
    workoutChecks: [],
    recentSkips: [],
    goal: {
      goal: { id: "g1", startDate: "2026-10-06", deadline: "2027-01-31", targets: { weight_kg: 74 } },
      weeksLeft: 12.7,
      daysLeft: 89,
      metrics: [
        { metric: "weight_kg", label: "Weight", unit: "kg", start: 84.2, latest: 81.9, latestDate: "2026-11-02", target: 74, progress: 0.23, requiredPerWeek: -0.62, actualPerWeek: -0.55, pace: "on_pace", projectedDate: "2027-02-08" },
      ],
      checkinDue: false,
      lastCheckinDate: "2026-11-02",
    },
    checkins: [
      { localDate: "2026-10-06", weight_kg: 84.2, body_fat_pct: 24, muscle_mass_kg: null },
      { localDate: "2026-10-26", weight_kg: 82.4, body_fat_pct: null, muscle_mass_kg: null },
      { localDate: "2026-11-02", weight_kg: 81.9, body_fat_pct: 22.8, muscle_mass_kg: null },
    ],
    activities: [],
    meals: [{ mealSessionId: "m-breakfast", slot: "breakfast", text: "poha and chai", calories: 610, proteinG: 28, loggedAt: "2026-11-03T08:40:00+05:30" }],
  };
  return { ...base, ...overrides };
}
