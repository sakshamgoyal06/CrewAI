import { beforeEach, describe, expect, it, vi } from "vitest";

import { HEALTH_CAPABILITY_IDS } from "./catalogs/healthCatalog.js";
import { GENERAL_CAPABILITY_IDS } from "./catalogs/generalCatalog.js";
import { isValidCapability } from "./catalogs/index.js";
import { parsePillarStrategy, pillarStrategyEnabled } from "./parsePillarStrategy.js";

const createMock = vi.fn();

vi.mock("../../../tools/clients.js", () => ({
  anthropic: {
    messages: {
      create: (...args: unknown[]) => createMock(...args),
    },
  },
}));

describe("parsePillarStrategy", () => {
  beforeEach(() => {
    createMock.mockReset();
  });

  it("returns valid JSON capability from LLM", async () => {
    createMock.mockResolvedValueOnce({
      content: [
        {
          type: "text",
          text: '{"capability":"meal_plan_create","confidence":0.92,"args":{"horizon_hint":"2 weeks"}}',
        },
      ],
    });

    const strategy = await parsePillarStrategy("HEALTH", "make meal plan for next 2 weeks", {
      has_meal_photo: false,
      explicit_meal_log: false,
      active_meal_plan_session: false,
      meal_plan_session_step: null,
      previous_turn_intent: null,
      previous_turn_capability: null,
      previous_turn_was_meal_log: false,
    });

    expect(strategy).toMatchObject({
      capability: "meal_plan_create",
      confidence: 0.92,
      parser: "llm",
      args: { horizon_hint: "2 weeks" },
    });
    expect(String(createMock.mock.calls[0]![0].system)).toContain("meal_plan_create");
    expect(String(createMock.mock.calls[0]![0].messages[0].content)).toContain("2 weeks");
  });

  it("falls back when LLM returns invalid capability", async () => {
    createMock.mockResolvedValueOnce({
      content: [{ type: "text", text: '{"capability":"not_real","confidence":0.9,"args":{}}' }],
    });

    const strategy = await parsePillarStrategy("HEALTH", "hello", {
      has_meal_photo: false,
      explicit_meal_log: false,
      active_meal_plan_session: false,
      meal_plan_session_step: null,
      previous_turn_intent: null,
      previous_turn_capability: null,
      previous_turn_was_meal_log: false,
    });

    expect(strategy.capability).toBe("generic_ack");
    expect(strategy.parser).toBe("deterministic");
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
