import { beforeEach, describe, expect, it, vi } from "vitest";

import { ENERGY_SYSTEM } from "./energyAgent.js";
import { routeHealthMessage } from "./healthRouter.js";
import { ALTERNATES_RECOMMENDER_SYSTEM } from "./alternatesRecommenderAgent.js";
import { LONG_TERM_HEALTH_PLANNING_SYSTEM } from "./longTermHealthPlanningAgent.js";
import { MEAL_PLANNER_SYSTEM } from "./mealPlannerAgent.js";
import { NUTRITION_SYSTEM } from "./nutritionPrompt.js";
import { FITNESS_SYSTEM } from "../../pillars/health/workouts/agents/fitnessAgent.js";

const createMock = vi.fn();

vi.mock("../../tools/clients.js", () => ({
  anthropic: {
    messages: {
      create: (...args: unknown[]) => createMock(...args),
    },
  },
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          contains: () => ({
            order: () => ({
              limit: () => Promise.resolve({ data: [], error: null }),
            }),
          }),
          order: () => ({
            limit: () => Promise.resolve({ data: [], error: null }),
          }),
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
        }),
      }),
    }),
  },
  redis: {},
}));

function ctx(raw: string) {
  return {
    userProfileId: "u1",
    telegramUserId: "t1",
    rawMessage: raw,
    intent: "HEALTH" as const,
  };
}

describe("routeHealthMessage", () => {
  beforeEach(() => {
    delete process.env.HEVY_API_KEY;
    delete process.env.MAGNUS_HEVY_API_KEY;
    createMock.mockReset();
    createMock.mockResolvedValue({
      content: [{ type: "text", text: "mock reply" }],
    });
  });

  it("routes hevy routine: to HevyWrite before Fitness when API key is unset", async () => {
    const out = await routeHealthMessage(ctx("hevy routine: Push — bench press 3x10"));
    expect(createMock).not.toHaveBeenCalled();
    expect(out.metadata).toMatchObject({
      health_order: "hevy_write",
      specialist: "HevyWrite",
      hevy_write: false,
    });
    expect(out.text).toMatch(/HEVY_API_KEY/i);
  });

  it("routes meal planning asks to MealPlanner before Fitness", async () => {
    const out = await routeHealthMessage(
      ctx("Plan my meals for the week — vegan, nut allergy, moderate protein."),
    );
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(String(createMock.mock.calls[0]![0].system)).toContain(
      MEAL_PLANNER_SYSTEM.slice(0, 40),
    );
    expect(out.metadata).toMatchObject({
      health_order: "meal_plan",
      specialist: "MealPlanner",
    });
  });

  it("routes food swap asks to Alternates after Fitness declines", async () => {
    const out = await routeHealthMessage(
      ctx("What's a good vegan alternative to butter for baking?"),
    );
    expect(createMock).toHaveBeenCalledTimes(2);
    expect(createMock.mock.calls[0]![0]).toMatchObject({
      system: expect.not.stringContaining("Alternates Recommender"),
    });
    expect(createMock.mock.calls[1]![0].system).toEqual(
      expect.stringContaining(ALTERNATES_RECOMMENDER_SYSTEM.slice(0, 40)),
    );
    expect(out.metadata).toMatchObject({
      health_order: "nutrition",
      specialist: "AlternatesRecommender",
    });
  });

  it("routes long-horizon training planning before Fitness", async () => {
    const out = await routeHealthMessage(
      ctx("16-week base phase before my spring half — how to sequence volume?"),
    );
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(String(createMock.mock.calls[0]![0].system)).toContain(
      LONG_TERM_HEALTH_PLANNING_SYSTEM.slice(0, 40),
    );
    expect(out.metadata).toMatchObject({
      health_order: "long_term_health_planning",
      specialist: "LongTermHealthPlanning",
      department: "long_term_health_planning",
      pillar: "health",
    });
  });

  it("prefers Fitness when both fitness and nutrition keywords appear", async () => {
    await routeHealthMessage(
      ctx("Gym leg day then high protein meal — how to balance?"),
    );
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(createMock.mock.calls[0][0]).toMatchObject({
      system: expect.stringContaining(FITNESS_SYSTEM.slice(0, 40)),
    });
  });

  it("routes to Nutrition when not fitness-owned but nutrition keywords match", async () => {
    await routeHealthMessage(
      ctx("How much protein per day on a cut? I'm allergic to dairy."),
    );
    expect(createMock.mock.calls.length).toBeGreaterThanOrEqual(2);
    const nutritionCalls = createMock.mock.calls.filter(
      (c) => String((c[0] as { system?: string }).system ?? "").includes("Nutrition agent for LifeOS"),
    );
    expect(nutritionCalls.length).toBeGreaterThanOrEqual(1);
    expect(nutritionCalls[0]![0]).toMatchObject({
      system: expect.stringContaining(NUTRITION_SYSTEM.slice(0, 40)),
    });
  });

  it("routes to Energy last when sleep/HRV/focus language matches after Fitness and Nutrition decline", async () => {
    await routeHealthMessage(ctx("HRV is low and I'm wiped — recovery tips?"));
    expect(createMock).toHaveBeenCalledTimes(2);
    expect(createMock.mock.calls[1][0]).toMatchObject({
      system: expect.stringContaining(ENERGY_SYSTEM.slice(0, 40)),
    });
  });

  it("calls the sub-classifier then returns generic acknowledgement when no specialist matches", async () => {
    const out = await routeHealthMessage(ctx("health check"));
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(out.metadata?.genericAck).toBe(true);
  });
});
