import { beforeEach, describe, expect, it, vi } from "vitest";

const messagesCreate = vi.fn();

vi.mock("../../tools/clients.js", () => ({
  anthropic: {
    messages: {
      create: (...args: unknown[]) => messagesCreate(...args),
    },
  },
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: () => Promise.resolve({ data: [], error: null }),
          }),
        }),
      }),
    }),
  },
  redis: {},
}));

import { runTradingCopilotAgent, TRADING_COPILOT_SYSTEM } from "./tradingCopilotAgent.js";

describe("tradingCopilotAgent", () => {
  beforeEach(() => {
    messagesCreate.mockResolvedValue({
      content: [{ type: "text", text: "Journal one line about emotional state before your next session." }],
    });
  });

  it("TRADING_COPILOT_SYSTEM states no trading, no broker connection, and no buy/sell instructions", () => {
    const s = TRADING_COPILOT_SYSTEM.toLowerCase();
    expect(s).toMatch(/cannot place trades|place trades/);
    expect(s).toMatch(/broker/);
    expect(s).toMatch(/buy\/?sell|buy.*sell/);
  });

  it("runTradingCopilotAgent returns expected metadata keys", async () => {
    const out = await runTradingCopilotAgent({
      userProfileId: "00000000-0000-0000-0000-000000000001",
      telegramUserId: "1",
      rawMessage: "Help me debrief a bad trade.",
      intent: "WEALTH",
    });
    expect(out.text).toBe(
      "Journal one line about emotional state before your next session.",
    );
    expect(out.metadata).toMatchObject({
      specialist: "TradingCopilot",
      pillar: "wealth",
      department: "trading",
      departmentIntent: "WEALTH",
    });
    expect(messagesCreate).toHaveBeenCalledWith(
      expect.objectContaining({ max_tokens: 768 }),
    );
  });
});
