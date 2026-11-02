import { describe, expect, it, vi } from "vitest";

vi.mock("../tools/clients.js", () => ({ supabase: {}, redis: {}, anthropic: {} }));

import { onboardingInput, startingPlan, type OnboardingInput } from "./onboarding.js";

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
