import { beforeEach, describe, expect, it, vi } from "vitest";

const messagesCreate = vi.fn();

vi.mock("../../tools/clients.js", () => ({
  anthropic: {
    messages: {
      create: (...args: unknown[]) => messagesCreate(...args),
    },
  },
  supabase: {},
  redis: {},
}));

import {
  MEAL_PLANNER_SYSTEM,
  matchesMealPlannerMessage,
  tryMealPlannerAgent,
} from "./mealPlannerAgent.js";

function ctx(raw: string) {
  return {
    userProfileId: "00000000-0000-0000-0000-000000000001",
    telegramUserId: "1",
    rawMessage: raw,
    intent: "HEALTH" as const,
  };
}

describe("mealPlannerAgent", () => {
  beforeEach(() => {
    messagesCreate.mockReset();
    messagesCreate.mockResolvedValue({
      content: [{ type: "text", text: "Mon: tofu bowl; Tue: lentil soup; …" }],
    });
  });

  it("MEAL_PLANNER_SYSTEM scopes planning vs logging and stays non-clinical", () => {
    const s = MEAL_PLANNER_SYSTEM.toLowerCase();
    expect(s).toMatch(/not.*doctor|dietitian/);
    expect(s).toMatch(/log|logging/);
    expect(s).toMatch(/week|day/);
  });

  it("matchesMealPlannerMessage is true for explicit planning asks", () => {
    expect(matchesMealPlannerMessage("Can you give me a meal plan for the week?")).toBe(true);
    expect(matchesMealPlannerMessage("Plan my meals for this week — 200g protein, dairy free")).toBe(
      true,
    );
    expect(matchesMealPlannerMessage("What should I eat this week on a budget?")).toBe(true);
  });

  it("matchesMealPlannerMessage is false for generic nutrition without planning intent", () => {
    expect(matchesMealPlannerMessage("How much protein per day on a cut?")).toBe(false);
    expect(matchesMealPlannerMessage("Is honey better than sugar?")).toBe(false);
  });

  it("tryMealPlannerAgent returns null for meal-log command syntax", async () => {
    const out = await tryMealPlannerAgent(ctx("/meal grilled chicken and rice"));
    expect(out).toBeNull();
    expect(messagesCreate).not.toHaveBeenCalled();
  });

  it("tryMealPlannerAgent returns null when not a planning ask", async () => {
    expect(await tryMealPlannerAgent(ctx("How much fiber do I need?"))).toBeNull();
    expect(messagesCreate).not.toHaveBeenCalled();
  });

  it("tryMealPlannerAgent returns metadata and calls Anthropic for planning asks", async () => {
    const out = await tryMealPlannerAgent(
      ctx("Weekly menu for high protein vegetarian — I have 30 min on weeknights."),
    );
    expect(out?.text).toContain("Mon:");
    expect(out?.metadata).toMatchObject({
      specialist: "MealPlanner",
      department: "nutrition",
      pillar: "health",
      sub_kind: "meal_plan",
    });
    expect(messagesCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.stringContaining(MEAL_PLANNER_SYSTEM.slice(0, 40)),
      }),
    );
  });
});
