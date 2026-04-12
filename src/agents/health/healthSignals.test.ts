import { describe, expect, it } from "vitest";

import {
  matchesEnergyMessage,
  matchesFitnessMessage,
  matchesNutritionMessage,
} from "./healthSignals.js";

describe("healthSignals", () => {
  it("matches fitness before other pillars on workout language", () => {
    expect(matchesFitnessMessage("Leg day tomorrow — increase squat volume")).toBe(true);
    expect(matchesFitnessMessage("How is the weather?")).toBe(false);
  });

  it("matches nutrition on meal and macro language", () => {
    expect(matchesNutritionMessage("Hit my protein target today")).toBe(true);
    expect(matchesNutritionMessage("Need a budget template")).toBe(false);
  });

  it("matches energy on sleep, HRV, focus, caffeine, burnout (non-clinical)", () => {
    expect(matchesEnergyMessage("My HRV tanked after poor sleep")).toBe(true);
    expect(matchesEnergyMessage("Too much caffeine, focus is scattered")).toBe(true);
    expect(matchesEnergyMessage("Feeling burnout and brain fog")).toBe(true);
    expect(matchesEnergyMessage("Quarterly OKR planning")).toBe(false);
  });

  it("allows energy when fitness and nutrition do not match", () => {
    expect(matchesFitnessMessage("I'm exhausted and can't sleep")).toBe(false);
    expect(matchesNutritionMessage("I'm exhausted and can't sleep")).toBe(false);
    expect(matchesEnergyMessage("I'm exhausted and can't sleep")).toBe(true);
  });
});
