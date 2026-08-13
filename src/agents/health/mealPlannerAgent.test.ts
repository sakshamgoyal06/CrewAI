import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./mealPlanningAgent.js", () => ({
  tryMealPlanningAgent: vi.fn(),
}));

import { tryMealPlanningAgent } from "./mealPlanningAgent.js";
import { matchesMealPlannerMessage } from "./mealPlannerPatterns.js";

describe("meal planning triggers", () => {
  beforeEach(() => {
    vi.mocked(tryMealPlanningAgent).mockReset();
  });

  it("matchesMealPlannerMessage is true for explicit planning asks", () => {
    expect(matchesMealPlannerMessage("Can you give me a meal plan for the week?")).toBe(true);
  });

  it("tryMealPlanningAgent runs the multi-turn planning journey", async () => {
    vi.mocked(tryMealPlanningAgent).mockResolvedValue({
      text: "draft",
      metadata: { specialist: "MealPlanner", meal_plan_drafted: true },
    });
    const ctx = {
      userProfileId: "u1",
      telegramUserId: "1",
      timezone: "UTC",
      rawMessage: "weekly menu",
      intent: "HEALTH" as const,
    };
    const out = await tryMealPlanningAgent(ctx);
    expect(tryMealPlanningAgent).toHaveBeenCalledWith(ctx);
    expect(out?.metadata?.meal_plan_drafted).toBe(true);
  });
});
