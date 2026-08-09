import { beforeEach, describe, expect, it, vi } from "vitest";

const messagesCreate = vi.fn();
const insertMock = vi.fn().mockResolvedValue({ error: null });

function chainEq(depth: number): unknown {
  if (depth <= 0) {
    return Promise.resolve({ error: null });
  }
  return { eq: () => chainEq(depth - 1) };
}

const deleteMock = vi.fn().mockReturnValue(chainEq(4));

vi.mock("../../tools/clients.js", () => ({
  anthropic: {
    messages: {
      create: (...args: unknown[]) => messagesCreate(...args),
    },
  },
  supabase: {
    from: () => ({
      delete: deleteMock,
      insert: insertMock,
    }),
  },
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
    timezone: "UTC",
    rawMessage: raw,
    intent: "HEALTH" as const,
  };
}

describe("mealPlannerAgent", () => {
  beforeEach(() => {
    messagesCreate.mockReset();
    insertMock.mockClear();
    messagesCreate.mockResolvedValue({
      content: [
        {
          type: "text",
          text: `Mon: tofu bowl\n\n\`\`\`json
{"entries":[{"local_date":"2026-08-09","meal_slot":"lunch","title":"Tofu bowl"}]}
\`\`\``,
        },
      ],
    });
  });

  it("MEAL_PLANNER_SYSTEM requires JSON for saving", () => {
    expect(MEAL_PLANNER_SYSTEM).toMatch(/json/i);
    expect(MEAL_PLANNER_SYSTEM).toMatch(/entries/);
  });

  it("matchesMealPlannerMessage is true for explicit planning asks", () => {
    expect(matchesMealPlannerMessage("Can you give me a meal plan for the week?")).toBe(true);
  });

  it("tryMealPlannerAgent returns null for meal-log command syntax", async () => {
    const out = await tryMealPlannerAgent(ctx("/meal grilled chicken and rice"));
    expect(out).toBeNull();
  });

  it("tryMealPlannerAgent persists plan when JSON is present", async () => {
    const out = await tryMealPlannerAgent(
      ctx("Weekly menu for high protein vegetarian — 30 min on weeknights."),
    );
    expect(out?.text).toContain("Saved 1 meal");
    expect(out?.metadata).toMatchObject({
      specialist: "MealPlanner",
      meal_plan_saved: true,
      saved_count: 1,
    });
    expect(insertMock).toHaveBeenCalled();
  });
});
