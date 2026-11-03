import { describe, expect, it, vi } from "vitest";

vi.mock("../tools/clients.js", () => ({ supabase: {}, redis: {}, anthropic: {} }));

import { cleanAvoidList, foodPrefsLine, onboardingInput, startingPlan, weekFrom, type OnboardingInput } from "./onboarding.js";

const TODAY = "2026-11-02";
const base: OnboardingInput = {
  sex: "male",
  birthYear: 1995,
  heightCm: 178,
  weightKg: 85,
  goalType: "lose",
  targetWeightKg: 77,
  deadline: "2027-03-01",
  activity: "desk",
  trainingDays: [1, 2, 4, 5],
  diet: "vegetarian",
  foodAvoid: [],
};

describe("startingPlan", () => {
  it("sets a deficit that reaches the target by the deadline", () => {
    const p = startingPlan(base, TODAY);
    // Mifflin: 850 + 1112.5 − 155 + 5 = 1812.5; × (1.2 + 4 × 0.025) = 2356.
    expect(p.bmrKcal).toBe(1813);
    expect(p.maintenanceKcal).toBe(2350);
    expect(p.calorieTarget).toBe(1850);
    expect(p.cappedForSafety).toBe(false);
    expect(p.plannedKgPerWeek).toBeCloseTo(-0.47, 1);
    expect(p.proteinTarget).toBe(155);
    expect(p.stepTarget).toBe(8000);
    expect(p.lines.join(" ")).toContain("77 kg by 1 Mar 2027");
  });

  it("caps an unsafe deadline and gives the date the safe pace gets there", () => {
    const p = startingPlan({ ...base, targetWeightKg: 65, deadline: "2026-12-28" }, TODAY);
    expect(p.cappedForSafety).toBe(true);
    expect(p.neededKgPerWeek).toBeLessThan(-2);
    // Never more than 1% of body weight a week, never more than 1,000 kcal under maintenance.
    expect(p.plannedKgPerWeek).toBeGreaterThanOrEqual(-0.86);
    expect(p.maintenanceKcal - p.calorieTarget).toBeLessThanOrEqual(1000);
    expect(p.safeDate).not.toBeNull();
    expect(p.safeDate! > "2026-12-28").toBe(true);
    expect(p.lines.join(" ")).toContain("faster than is safe");
  });

  it("never goes under the calorie floor", () => {
    const p = startingPlan(
      { ...base, sex: "female", birthYear: 1970, heightCm: 152, weightKg: 52, targetWeightKg: 47, trainingDays: [], deadline: "2026-12-15" },
      TODAY,
    );
    expect(p.calorieTarget).toBe(1200);
    expect(p.cappedForSafety).toBe(true);
  });

  it("derives a target weight from a body fat goal, keeping lean mass", () => {
    const p = startingPlan({ ...base, targetWeightKg: undefined, bodyFatPct: 25, targetBodyFatPct: 15 }, TODAY);
    // Lean 63.75 kg → at 15% body fat that's 75 kg.
    expect(p.targetWeightKg).toBe(75);
    // Protein from lean mass: 63.75 × 2.2 = 140.
    expect(p.proteinTarget).toBe(140);
  });

  it("gives a recomp a small deficit with no weight target", () => {
    const p = startingPlan({ ...base, goalType: "recomp", targetWeightKg: undefined }, TODAY);
    expect(p.maintenanceKcal - p.calorieTarget).toBeGreaterThanOrEqual(200);
    expect(p.maintenanceKcal - p.calorieTarget).toBeLessThanOrEqual(300);
    expect(p.lines.join(" ")).toContain("recomp");
  });

  it("gains slowly for a lean bulk", () => {
    const p = startingPlan({ ...base, goalType: "gain", weightKg: 65, targetWeightKg: 75, deadline: "2027-11-01" }, TODAY);
    expect(p.calorieTarget).toBeGreaterThan(p.maintenanceKcal);
    expect(p.plannedKgPerWeek).toBeLessThanOrEqual(0.36);
  });
});

describe("onboardingInput", () => {
  it("needs a target unless it's a recomp", () => {
    const { targetWeightKg: _t, ...noTarget } = base;
    expect(onboardingInput.safeParse(noTarget).success).toBe(false);
    expect(onboardingInput.safeParse({ ...noTarget, goalType: "recomp" }).success).toBe(true);
    expect(onboardingInput.safeParse({ ...base, diet: "keto" }).success).toBe(false);
  });
});

describe("food preferences", () => {
  it("needs a description for a custom diet", () => {
    expect(onboardingInput.safeParse({ ...base, diet: "custom" }).success).toBe(false);
    expect(onboardingInput.safeParse({ ...base, diet: "custom", dietNote: "pescatarian, no beef" }).success).toBe(true);
  });

  it("cleans the avoid list", () => {
    expect(cleanAvoidList([" Peanuts ", "peanuts", "tree  nuts", ""])).toEqual(["Peanuts", "tree nuts"]);
  });

  it("tells the coach the diet and what never to suggest", () => {
    expect(foodPrefsLine({ diet: "custom", diet_note: "pescatarian", food_avoid: ["Peanuts", "Dairy"] })).toBe(
      "diet (their words): pescatarian; must avoid (allergy, intolerance or won't eat; never suggest these or dishes containing them): Peanuts, Dairy",
    );
    expect(foodPrefsLine({ diet: "jain", food_avoid: [] })).toBe("diet: Jain (no root vegetables, no eggs or meat)");
    expect(foodPrefsLine({})).toBeNull();
  });
});

describe("routine at onboarding", () => {
  const routine = [
    { activity: "walking", days: [0, 1, 2, 3, 4, 5, 6], startTime: "07:00", durationMin: 30 },
    { activity: "gym", days: [1, 3, 5], startTime: "18:30", durationMin: 60 },
    { activity: "swimming", days: [2], startTime: "06:30", durationMin: 45 },
  ];

  it("derives training days and the gym slot from the routine", () => {
    expect(weekFrom({ ...base, routine })).toEqual({ trainingDays: [1, 2, 3, 5], gymTime: "18:30" });
    expect(weekFrom(base)).toEqual({ trainingDays: [1, 2, 4, 5], gymTime: null });
  });

  it("uses the routine's training days for maintenance, and says when the gym is short", () => {
    const same = startingPlan({ ...base, routine }, TODAY);
    expect(same.maintenanceKcal).toBe(startingPlan(base, TODAY).maintenanceKcal);
    expect(same.lines.join(" ")).toContain("do what your routine has for that day");
    const short = startingPlan({ ...base, routine: [routine[0]!, { ...routine[1]!, days: [1] }, { ...routine[2]!, days: [2, 4] }] }, TODAY);
    expect(short.lines.join(" ")).toContain("Your routine has 1 gym day a week. The plan needs at least 3 strength sessions");
  });

  it("accepts a routine in the input", () => {
    expect(onboardingInput.safeParse({ ...base, routine }).success).toBe(true);
    expect(onboardingInput.safeParse({ ...base, routine: [{ ...routine[0]!, days: [] }] }).success).toBe(false);
  });
});
