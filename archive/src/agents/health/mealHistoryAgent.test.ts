import { describe, expect, it } from "vitest";

import { matchesMealHistoryMessage } from "./mealHistoryAgent.js";

describe("mealHistoryAgent routing guards", () => {
  it("defers meal plan asks to meal_plan_read", () => {
    expect(matchesMealHistoryMessage("So whats my todays meal plan?")).toBe(false);
  });

  it("defers slot-only follow-ups to meal_plan_read", () => {
    expect(matchesMealHistoryMessage("Dinner?")).toBe(false);
  });

  it("still matches logged meal history asks", () => {
    expect(matchesMealHistoryMessage("what did I eat today")).toBe(true);
    expect(matchesMealHistoryMessage("Meal breakdown for entire day")).toBe(true);
  });
});
