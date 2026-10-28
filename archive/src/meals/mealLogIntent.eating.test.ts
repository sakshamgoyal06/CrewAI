import { describe, expect, it } from "vitest";

import { isMealLogWriteIntent, extractPastMealFoodText } from "./mealLogIntent.js";

describe("present-tense eating (PI-001)", () => {
  it("treats I am eating as meal log write intent", () => {
    expect(isMealLogWriteIntent("I am eating a dahi aloo tikki from bistro")).toBe(true);
  });

  it("extracts food from I am eating", () => {
    expect(extractPastMealFoodText("I am eating a salad right now")).toBe("a salad right now");
  });
});
