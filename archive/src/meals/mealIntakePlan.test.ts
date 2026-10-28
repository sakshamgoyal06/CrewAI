import { beforeEach, describe, expect, it, vi } from "vitest";

import { buildMealLogPlanFromIntakeParser } from "./mealIntakePlan.js";

const parseMock = vi.fn();

vi.mock("../agents/health/mealIntakeParserAgent.js", () => ({
  parseMealIntakeFromMessage: (...args: unknown[]) => parseMock(...args),
}));

describe("buildMealLogPlanFromIntakeParser", () => {
  beforeEach(() => {
    parseMock.mockReset();
  });

  it("maps intake meals to meal_log steps with components in args", async () => {
    parseMock.mockResolvedValue({
      replaceTodayLog: false,
      parser: "llm",
      meals: [
        {
          mealSlot: "lunch",
          logKind: "meal",
          mealText: "2 paratha and raita",
          components: [
            { user_label: "paratha", api_query: "2 medium paratha" },
            { user_label: "raita", api_query: "100g raita" },
          ],
        },
      ],
    });

    const plan = await buildMealLogPlanFromIntakeParser({
      userProfileId: "u1",
      telegramUserId: "t1",
      rawMessage: "I had 2 paratha and raita for lunch",
      intent: "HEALTH",
    });

    expect(plan?.steps).toHaveLength(1);
    expect(plan?.steps[0]?.capability).toBe("meal_log");
    expect(plan?.steps[0]?.args.meal_slot).toBe("lunch");
    expect(plan?.steps[0]?.args.intake_components).toHaveLength(2);
    expect(plan?.replace_today_log).toBe(false);
  });
});
