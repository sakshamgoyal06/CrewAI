import { describe, expect, it, vi } from "vitest";

vi.mock("../tools/clients.js", () => ({ supabase: {}, anthropic: {} }));

import { burnForDay, clampDays, detailWorkout, groupMeals, stepsBurn, workoutBurn } from "./history.js";

const row = (o: Record<string, unknown>) => ({
  meal_session_id: "m1",
  local_date: "2026-11-01",
  meal_slot: "lunch",
  raw_text: "rice, paneer",
  description: null,
  calories: 0,
  protein_g: 0,
  carbs_g: 0,
  fat_g: 0,
  logged_at: "2026-11-01T07:00:00Z",
  created_at: "2026-11-01T07:00:00Z",
  component_index: 0,
  ...o,
});

describe("groupMeals", () => {
  it("groups item rows into one meal per session with summed macros, items in order", () => {
    const days = groupMeals([
      row({ component_index: 1, description: "Paneer 100 g", calories: 265, protein_g: 18, carbs_g: 3, fat_g: 20 }),
      row({ component_index: 0, description: "Rice 1 cup", calories: 240, protein_g: 4, carbs_g: 52, fat_g: 1 }),
      row({ meal_session_id: "m0", meal_slot: "breakfast", raw_text: "oats", calories: "300", protein_g: "10.25", logged_at: "2026-11-01T02:00:00Z" }),
      row({ meal_session_id: "m2", local_date: "2026-10-31", calories: 500 }),
      row({ meal_session_id: null, calories: 999 }),
    ]);
    const today = days.get("2026-11-01")!;
    expect(today.map((m) => m.mealSessionId)).toEqual(["m0", "m1"]);
    expect(today[1]).toMatchObject({ slot: "lunch", calories: 505, proteinG: 22, carbsG: 55, fatG: 21 });
    expect(today[1]!.items.map((i) => i.name)).toEqual(["Rice 1 cup", "Paneer 100 g"]);
    expect(today[0]).toMatchObject({ calories: 300, proteinG: 10.3, items: [{ name: "oats" }] });
    expect(days.get("2026-10-31")).toHaveLength(1);
  });
});

describe("detailWorkout", () => {
  it("keeps exercises and sets in order and counts volume on working sets only", () => {
    const w = detailWorkout({
      id: "w1",
      title: "Push",
      start_time: "2026-11-01T12:00:00Z",
      end_time: "2026-11-01T13:05:00Z",
      exercises: [
        { index: 1, title: "Plank", sets: [{ index: 0, duration_seconds: 60 }] },
        {
          index: 0,
          title: "Bench Press",
          sets: [
            { index: 1, type: "normal", weight_kg: 60, reps: 8 },
            { index: 0, type: "warmup", weight_kg: 40, reps: 10 },
            { index: 2, type: "normal", weight_kg: 62.5, reps: 6 },
          ],
        },
      ],
    })!;
    expect(w.durationMin).toBe(65);
    expect(w.exercises.map((e) => e.title)).toEqual(["Bench Press", "Plank"]);
    expect(w.exercises[0]!.sets.map((s) => s.type)).toEqual(["warmup", "normal", "normal"]);
    expect(w.volumeKg).toBe(855);
    expect(w.setCount).toBe(3);
    expect(w.exercises[1]!.sets[0]).toMatchObject({ durationS: 60, weightKg: null });
  });

  it("drops workouts without a start time", () => {
    expect(detailWorkout({ title: "x" })).toBeNull();
  });
});

describe("burn", () => {
  it("uses the phone's active calories when present", () => {
    expect(burnForDay({ activeKcal: 412.6, steps: 8000, workouts: [{ startTime: "2026-10-28T12:00:00Z", durationMin: 60 }], activities: [], weightKg: 80 })).toMatchObject({ kcal: 413, source: "health_connect" });
  });

  it("estimates from steps and workout time otherwise", () => {
    expect(stepsBurn(8000, 80)).toBe(320);
    expect(workoutBurn(60, 80)).toBe(420);
    expect(burnForDay({ activeKcal: null, steps: 8000, workouts: [{ startTime: "2026-10-28T12:00:00Z", durationMin: 60 }], activities: [], weightKg: 80 })).toEqual({ kcal: 740, source: "estimate", stepsKcal: 320, workoutKcal: 420, activityKcal: 0, activities: [] });
    expect(burnForDay({ activeKcal: 0, steps: 0, workouts: [], activities: [], weightKg: 80 })).toBeNull();
  });
});

describe("clampDays", () => {
  it("defaults and caps the range", () => {
    expect(clampDays(undefined)).toBe(30);
    expect(clampDays("7")).toBe(7);
    expect(clampDays("500")).toBe(56);
    expect(clampDays("-3")).toBe(30);
  });
});
