import { beforeEach, describe, expect, it, vi } from "vitest";

import { HEALTH_CAPABILITY_IDS } from "./catalogs/healthCatalog.js";
import { GENERAL_CAPABILITY_IDS } from "./catalogs/generalCatalog.js";
import { isValidCapability } from "./catalogs/index.js";
import {
  parsePillarExecutionPlan,
  parsePillarStrategy,
  pillarStrategyEnabled,
} from "./parsePillarStrategy.js";

const createMock = vi.fn();

vi.mock("../../../tools/clients.js", () => ({
  anthropic: {
    messages: {
      create: (...args: unknown[]) => createMock(...args),
    },
  },
}));

describe("parsePillarExecutionPlan", () => {
  beforeEach(() => {
    createMock.mockReset();
  });

  it("returns multi-step plan from LLM JSON", async () => {
    createMock.mockResolvedValueOnce({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            confidence: 0.92,
            steps: [
              {
                capability: "meal_plan_read",
                args: { horizon_hint: "this week" },
                intent_summary: "Show meal plan for this week",
              },
              {
                capability: "meal_plan_shopping_list",
                args: {},
                intent_summary: "Build shopping list from the plan",
              },
            ],
          }),
        },
      ],
    });

    const plan = await parsePillarExecutionPlan(
      "HEALTH",
      "show my meal plan this week and give me the shopping list",
      {
        has_meal_photo: false,
        explicit_meal_log: false,
        active_meal_plan_session: false,
        meal_plan_session_step: null,
        previous_turn_intent: null,
        previous_turn_capability: null,
        previous_turn_was_meal_log: false,
      },
    );

    expect(plan).toMatchObject({
      confidence: 0.92,
      parser: "llm",
      steps: [
        { capability: "meal_plan_read", args: { horizon_hint: "this week" } },
        { capability: "meal_plan_shopping_list", args: {} },
      ],
    });
    expect(plan.steps).toHaveLength(2);
    expect(String(createMock.mock.calls[0]![0].system)).toContain("meal_plan_read");
  });

  it("accepts legacy single-capability JSON shape", async () => {
    createMock.mockResolvedValueOnce({
      content: [
        {
          type: "text",
          text: '{"capability":"meal_plan_create","confidence":0.92,"args":{"horizon_hint":"2 weeks"}}',
        },
      ],
    });

    const plan = await parsePillarStrategy("HEALTH", "make meal plan for next 2 weeks", {
      has_meal_photo: false,
      explicit_meal_log: false,
      active_meal_plan_session: false,
      meal_plan_session_step: null,
      previous_turn_intent: null,
      previous_turn_capability: null,
      previous_turn_was_meal_log: false,
    });

    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0]).toMatchObject({
      capability: "meal_plan_create",
      args: { horizon_hint: "2 weeks" },
    });
    expect(plan.confidence).toBe(0.92);
  });

  it("falls back when LLM returns invalid capabilities", async () => {
    createMock.mockResolvedValueOnce({
      content: [{ type: "text", text: '{"steps":[{"capability":"not_real","args":{}}],"confidence":0.9}' }],
    });

    const plan = await parsePillarExecutionPlan("HEALTH", "hello", {
      has_meal_photo: false,
      explicit_meal_log: false,
      active_meal_plan_session: false,
      meal_plan_session_step: null,
      previous_turn_intent: null,
      previous_turn_capability: null,
      previous_turn_was_meal_log: false,
    });

    expect(plan.steps[0]?.capability).toBe("generic_ack");
    expect(plan.parser).toBe("deterministic");
  });

  it("validates catalog membership", () => {
    for (const id of HEALTH_CAPABILITY_IDS) {
      expect(isValidCapability("HEALTH", id)).toBe(true);
    }
    for (const id of GENERAL_CAPABILITY_IDS) {
      expect(isValidCapability("GENERAL", id)).toBe(true);
    }
    expect(isValidCapability("HEALTH", "calendar")).toBe(false);
  });

  it("pillarStrategyEnabled defaults true unless env disables", () => {
    delete process.env.MAGNUS_PILLAR_STRATEGY_PARSER;
    expect(pillarStrategyEnabled()).toBe(true);
    process.env.MAGNUS_PILLAR_STRATEGY_PARSER = "false";
    expect(pillarStrategyEnabled()).toBe(false);
    delete process.env.MAGNUS_PILLAR_STRATEGY_PARSER;
  });
});
