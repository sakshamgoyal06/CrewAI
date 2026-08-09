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

import { dispatchToAgent, findAgentForIntent } from "./registry.js";

const BASE = {
  userProfileId: "00000000-0000-0000-0000-000000000001",
  telegramUserId: "1",
};

describe("pillar dispatch", () => {
  beforeEach(() => {
    process.env.MAGNUS_PILLAR_STRATEGY_PARSER = "false";
    messagesCreate.mockReset();
    messagesCreate.mockResolvedValue({
      content: [{ type: "text", text: "Specialist answer." }],
    });
  });

  it.each([
    ["WEALTH", "Wealth", "wealth"],
    ["HAPPINESS", "Happiness", "joy"],
    ["WISDOM", "Wisdom", "wisdom"],
  ] as const)("dispatches %s to %s", async (intent, agentName, pillar) => {
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
    await dispatchToAgent(
      { ...BASE, rawMessage: "how should I budget?", intent: "WEALTH" },
      "WEALTH",
    );
    expect(messagesCreate).toHaveBeenCalledWith(
      expect.objectContaining({ max_tokens: 768 }),
    );
  });
});
