import { describe, expect, it } from "vitest";

import {
  looksLikeMealSlotFollowUp,
  recentTurnWasMealContext,
} from "./mealPlanFollowUp.js";

describe("mealPlanFollowUp", () => {
  it("detects short meal-slot follow-ups", () => {
    expect(looksLikeMealSlotFollowUp("Dinner?")).toBe(true);
    expect(looksLikeMealSlotFollowUp("what about lunch")).toBe(true);
    expect(looksLikeMealSlotFollowUp("add books to readlist")).toBe(false);
  });

  it("detects recent meal context from assistant preview", () => {
    expect(
      recentTurnWasMealContext([
        {
          role: "assistant",
          content: "**Your meal plan for today:** Breakfast … 1102 kcal",
        },
      ]),
    ).toBe(true);
    expect(
      recentTurnWasMealContext([
        { role: "assistant", content: "Bike pickup logged for today." },
      ]),
    ).toBe(false);
  });
});
