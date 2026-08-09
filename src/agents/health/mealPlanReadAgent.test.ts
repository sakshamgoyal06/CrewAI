import { describe, expect, it } from "vitest";

import { matchesMealPlanReadMessage } from "./mealPlanReadAgent.js";

describe("mealPlanReadAgent", () => {
  it("matches show plan asks", () => {
    expect(matchesMealPlanReadMessage("what's planned for today?")).toBe(true);
    expect(matchesMealPlanReadMessage("show my meal plan this week")).toBe(true);
  });

  it("matches skip and swap", () => {
    expect(matchesMealPlanReadMessage("skip lunch tomorrow")).toBe(true);
    expect(matchesMealPlanReadMessage("swap dinner for fish curry")).toBe(true);
  });

  it("does not match meal log commands", () => {
    expect(matchesMealPlanReadMessage("log lunch: rice")).toBe(false);
  });

  it("does not match planning asks (planner owns those)", () => {
    expect(matchesMealPlanReadMessage("plan my meals for the week")).toBe(false);
  });
});
