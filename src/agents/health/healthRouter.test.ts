import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../tools/routingContext.js", () => ({
  fetchRecentRoutingTurns: vi.fn().mockResolvedValue([]),
}));

import { ENERGY_SYSTEM } from "./energyAgent.js";
import { routeHealthMessage } from "./healthRouter.js";
import { ALTERNATES_RECOMMENDER_SYSTEM } from "./alternatesRecommenderAgent.js";
import { LONG_TERM_HEALTH_PLANNING_SYSTEM } from "./longTermHealthPlanningAgent.js";
import { NUTRITION_SYSTEM } from "./nutritionPrompt.js";
import { FITNESS_SYSTEM } from "../../pillars/health/workouts/agents/fitnessAgent.js";

const createMock = vi.fn();
const sessionState = {
  active: null as Record<string, unknown> | null,
};

vi.mock("../../tools/clients.js", () => ({
  anthropic: {
    messages: {
      create: (...args: unknown[]) => createMock(...args),
    },
  },
  supabase: {
    from: (table: string) => {
      if (table === "meal_plan_sessions") {
        return {
          select: () => ({
            eq: () => ({
              in: () => ({
                order: () => ({
                  limit: () => ({
                    maybeSingle: () =>
                      Promise.resolve({ data: sessionState.active, error: null }),
                  }),
                }),
              }),
            }),
          }),
          insert: () => ({
            select: () => ({
              single: () =>
                Promise.resolve({
                  data: {
                    id: "sess-1",
                    user_profile_id: "u1",
                    status: "gathering",
                    step: "horizon",
                    slots: ["breakfast", "lunch", "dinner"],
                    draft_entries: [],
                  },
                  error: null,
                }),
            }),
          }),
          update: () => ({
            eq: () => Promise.resolve({ error: null }),
          }),
        };
      }
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: null, error: null }),
            }),
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
        delete: () => ({
          eq: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => Promise.resolve({ error: null }),
              }),
            }),
          }),
        }),
        insert: () => Promise.resolve({ error: null }),
      };
    },
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
    process.env.MAGNUS_PILLAR_STRATEGY_PARSER = "false";
    sessionState.active = null;
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
    expect(createMock).not.toHaveBeenCalled();
    expect(out.metadata).toMatchObject({
      specialist: "MealPlanner",
      meal_plan_step: "slots",
    });
    expect(out.text).toMatch(/Which meals each day/i);
  });

  it("routes cancel planning via pillar parser when strategy is on", async () => {
    process.env.MAGNUS_PILLAR_STRATEGY_PARSER = "true";
    createMock.mockResolvedValueOnce({
      content: [
        {
          type: "text",
          text: '{"confidence":0.95,"steps":[{"capability":"meal_plan_create","args":{}}]}',
        },
      ],
    });
    const out = await routeHealthMessage(ctx("cancel planning"));
    expect(out.text).toMatch(/cancelled/i);
    expect(out.metadata).toMatchObject({
      meal_plan_cancelled: true,
      health_router: "pillar_plan",
    });
  });

  it("continues active draft session for follow-up questions without meal_plan_read", async () => {
    process.env.MAGNUS_PILLAR_STRATEGY_PARSER = "true";
    process.env.MAGNUS_PILLAR_PLAN_COMPOSE = "false";
    sessionState.active = {
      id: "sess-review",
      user_profile_id: "u1",
      status: "draft",
      step: "review",
      horizon_start: "2026-08-09",
      horizon_end: "2026-08-09",
      slots: ["breakfast", "lunch", "dinner"],
      constraints_text: null,
      draft_entries: [
        { local_date: "2026-08-09", meal_slot: "breakfast", title: "Oats" },
        { local_date: "2026-08-09", meal_slot: "lunch", title: "Dal rice" },
        { local_date: "2026-08-09", meal_slot: "dinner", title: "Paneer stir fry" },
      ],
      draft_display: "**Mon 9 Aug**\n- Breakfast: Oats\n- Lunch: Dal rice\n- Dinner: Paneer stir fry",
      revision_notes: null,
      created_at: "",
      updated_at: "",
      expires_at: "",
    };
    createMock.mockResolvedValueOnce({
      content: [{ type: "text", text: "Monday balances protein across three meals — oats AM, dal at lunch, paneer at dinner." }],
    });

    const out = await routeHealthMessage(ctx("What about the whole day on Monday?"));

    expect(out.metadata).toMatchObject({
      meal_plan_question: true,
      health_router: "pillar_plan",
    });
    expect(out.text).toMatch(/Monday balances protein/i);
    expect(out.text).not.toMatch(/\*\*Mon 9 Aug\*\*/);
    expect(out.text).not.toMatch(/Reply \*\*save plan\*\* to lock this menu/);
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
