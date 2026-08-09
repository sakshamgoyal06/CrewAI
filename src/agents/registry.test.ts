import { beforeEach, describe, expect, it, vi } from "vitest";

const messagesCreate = vi.fn();

vi.mock("../tools/clients.js", () => ({
  anthropic: {
    messages: {
      create: (...args: unknown[]) => messagesCreate(...args),
    },
  },
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            order: () => ({
              limit: () => Promise.resolve({ data: [], error: null }),
            }),
          }),
          in: () => ({
            order: () => ({
              limit: () => ({
                maybeSingle: () => Promise.resolve({ data: null, error: null }),
              }),
            }),
          }),
          order: () => ({
            limit: () => Promise.resolve({ data: [], error: null }),
          }),
        }),
      }),
    }),
  },
  redis: {},
}));

vi.mock("../tools/routingContext.js", () => ({
  fetchRecentRoutingTurns: vi.fn().mockResolvedValue([]),
}));

vi.mock("./routing/pillarStrategy/buildRoutingHints.js", () => ({
  buildRoutingHints: vi.fn().mockResolvedValue({
    has_meal_photo: false,
    explicit_meal_log: false,
    active_meal_plan_session: false,
    meal_plan_session_step: null,
    previous_turn_intent: null,
    previous_turn_capability: null,
    previous_turn_was_meal_log: false,
    previous_turn_meal_plan_locked: false,
    google_calendar_connected: false,
    youtube_connected: false,
    notion_connected: false,
    hevy_connected: false,
    zerodha_connected: false,
    recent_turns: [],
  }),
}));

vi.mock("../pillars/wealth/zerodha/index.js", () => ({
  fetchKitePortfolioSnapshot: vi.fn().mockResolvedValue({
    ok: false,
    error: "not_connected",
    meta: { kite: "not_connected" },
  }),
  formatKitePortfolioForPrompt: vi.fn().mockReturnValue(""),
}));

import { dispatchToAgent, findAgentForIntent } from "./registry.js";

const BASE = {
  userProfileId: "00000000-0000-0000-0000-000000000001",
  telegramUserId: "1",
};

function parserPlan(capability: string, pillar: "WEALTH" | "HAPPINESS" | "WISDOM") {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          confidence: 0.95,
          steps: [{ capability, args: {} }],
        }),
      },
    ],
  };
}

describe("pillar dispatch", () => {
  beforeEach(() => {
    process.env.MAGNUS_PILLAR_PLAN_COMPOSE = "false";
    messagesCreate.mockReset();
    messagesCreate.mockResolvedValue({
      content: [{ type: "text", text: "Specialist answer." }],
    });
  });

  it.each([
    ["WEALTH", "Wealth", "wealth", "coaching"],
    ["HAPPINESS", "Happiness", "joy", "recommendations"],
    ["WISDOM", "Wisdom", "wisdom", "coaching"],
  ] as const)("dispatches %s to %s", async (intent, agentName, pillar, capability) => {
    messagesCreate.mockResolvedValueOnce(parserPlan(capability, intent));
    messagesCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "Specialist answer." }],
    });

    const out = await dispatchToAgent(
      { ...BASE, rawMessage: "a question", intent },
      intent,
    );
    expect(out?.agentName).toBe(agentName);
    expect(out?.result.metadata).toMatchObject({ specialist: agentName, pillar });
  });

  it("registers a specialist for every pillar intent", () => {
    for (const intent of ["HEALTH", "WEALTH", "HAPPINESS", "WISDOM"] as const) {
      expect(findAgentForIntent(intent)).not.toBeNull();
    }
  });

  it("has no specialist for GENERAL — Magnus answers those himself", () => {
    expect(findAgentForIntent("GENERAL")).toBeNull();
  });

  it("keeps light pillar replies bounded", async () => {
    messagesCreate.mockResolvedValueOnce(parserPlan("coaching", "WEALTH"));
    messagesCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "Specialist answer." }],
    });

    await dispatchToAgent(
      { ...BASE, rawMessage: "how should I budget?", intent: "WEALTH" },
      "WEALTH",
    );
    expect(messagesCreate).toHaveBeenCalledWith(
      expect.objectContaining({ max_tokens: 768 }),
    );
  });
});
