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

import {
  INVESTMENT_ANALYST_SYSTEM,
  runInvestmentAnalystAgent,
} from "./investmentAnalystAgent.js";

describe("investmentAnalystAgent", () => {
  beforeEach(() => {
    messagesCreate.mockResolvedValue({
      content: [
        {
          type: "text",
          text: "Diversification spreads idiosyncratic risk; thesis risk is what invalidates your core case.",
        },
      ],
    });
  });

  it("INVESTMENT_ANALYST_SYSTEM includes a not-financial-advice disclaimer", () => {
    const s = INVESTMENT_ANALYST_SYSTEM.toLowerCase();
    expect(s).toMatch(/not financial advice|not\s+.*financial advice/);
    expect(s).toMatch(/licensed professional|qualified financial/);
  });

  it("runInvestmentAnalystAgent returns expected metadata and calls Anthropic", async () => {
    const out = await runInvestmentAnalystAgent({
      userProfileId: "00000000-0000-0000-0000-000000000001",
      telegramUserId: "1",
      rawMessage: "Explain allocation vs diversification in plain terms.",
      intent: "WEALTH",
    });
    expect(out.text).toBe(
      "Diversification spreads idiosyncratic risk; thesis risk is what invalidates your core case.",
    );
    expect(out.metadata).toMatchObject({
      specialist: "InvestmentAnalyst",
      pillar: "wealth",
      department: "investment",
      departmentIntent: "WEALTH",
    });
    expect(messagesCreate).toHaveBeenCalledWith(
      expect.objectContaining({ max_tokens: 768 }),
    );
  });
});
