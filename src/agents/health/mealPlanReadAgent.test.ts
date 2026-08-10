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

  it("matches templates and shopping list", () => {
    expect(matchesMealPlanReadMessage("save this week as template high-protein")).toBe(true);
    expect(matchesMealPlanReadMessage("use template high-protein")).toBe(true);
    expect(matchesMealPlanReadMessage("list my meal plan templates")).toBe(true);
    expect(matchesMealPlanReadMessage("shopping list for this week")).toBe(true);
  });

  it("does not match planning asks (planner owns those)", () => {
    expect(matchesMealPlanReadMessage("plan my meals for the week")).toBe(false);
  });

  it("matches today's meal plan asks", () => {
    expect(matchesMealPlanReadMessage("So whats my todays meal plan?")).toBe(true);
  });
});
