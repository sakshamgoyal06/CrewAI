import { describe, expect, it } from "vitest";

import { isMealCalorieDisputeMessage } from "./mealCalorieDispute.js";

describe("isMealCalorieDisputeMessage", () => {
  it("detects calorie total disputes", () => {
    expect(isMealCalorieDisputeMessage("It is not 1930 calories.")).toBe(true);
    expect(isMealCalorieDisputeMessage("That total is wrong")).toBe(false);
    expect(isMealCalorieDisputeMessage("log lunch: rice")).toBe(false);
  });
});
