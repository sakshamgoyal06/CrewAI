import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  NEUTRAL_ROUTING_CONTEXT,
  parseRoutingContext,
  routingContextToIntentHints,
} from "./routingContextParser.js";

const createMock = vi.fn();

vi.mock("../../tools/clients.js", () => ({
  anthropic: {
    messages: {
      create: (...args: unknown[]) => createMock(...args),
    },
  },
}));

describe("parseRoutingContext", () => {
  beforeEach(() => {
    createMock.mockReset();
  });

  it("parses LLM JSON into routing signals", async () => {
    createMock.mockResolvedValueOnce({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            explicit_meal_log: false,
            looks_like_meal_log_read: false,
            looks_like_youtube_action: false,
            looks_like_magnus_tool_action: true,
            looks_like_magnus_tool_continuation: false,
            looks_like_health_fitness_read: false,
            looks_like_wealth_portfolio_read: false,
            holistic_day_ask: false,
            saved_media_pick: false,
            schedule_accuracy_challenge: false,
            compound_action: false,
            prefer_intent_health: false,
            consult_pillars: [],
            magnus_capabilities: ["calendar"],
          }),
        },
      ],
    });

    const signals = await parseRoutingContext({
      userMessage: "Check calendar from 7 Sept to 25 Sept and delete other events",
    });

    expect(signals.looks_like_magnus_tool_action).toBe(true);
    expect(signals.schedule_accuracy_challenge).toBe(false);
    expect(signals.magnus_capabilities).toEqual(["calendar"]);
  });

  it("returns neutral signals when LLM output is invalid", async () => {
    createMock.mockResolvedValueOnce({
      content: [{ type: "text", text: "not json" }],
    });

    const signals = await parseRoutingContext({ userMessage: "hello" });
    expect(signals).toEqual(NEUTRAL_ROUTING_CONTEXT);
  });

  it("maps to intent classifier hints", () => {
    const hints = routingContextToIntentHints({
      ...NEUTRAL_ROUTING_CONTEXT,
      holistic_day_ask: true,
    });
    expect(hints.holistic_day_ask).toBe(true);
  });
});
