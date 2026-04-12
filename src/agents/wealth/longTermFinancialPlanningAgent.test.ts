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
  LONG_TERM_FINANCIAL_PLANNING_SYSTEM,
  runLongTermFinancialPlanningAgent,
} from "./longTermFinancialPlanningAgent.js";

describe("longTermFinancialPlanningAgent", () => {
  beforeEach(() => {
    messagesCreate.mockResolvedValue({
      content: [
        {
          type: "text",
          text: "Name a few milestones, then sketch two scenarios: steady savings vs a year with higher costs.",
        },
      ],
    });
  });

  it("LONG_TERM_FINANCIAL_PLANNING_SYSTEM discourages definitive tax/legal advice and encourages professionals", () => {
    const s = LONG_TERM_FINANCIAL_PLANNING_SYSTEM.toLowerCase();
    expect(s).toMatch(/jurisdiction|tax|legal/);
    expect(s).toMatch(/professional|qualified|licensed/);
    expect(s).toMatch(/milestone|scenario|savings/);
  });

  it("runLongTermFinancialPlanningAgent returns expected metadata and calls Anthropic", async () => {
    const out = await runLongTermFinancialPlanningAgent({
      userProfileId: "00000000-0000-0000-0000-000000000001",
      telegramUserId: "1",
      rawMessage:
        "Help me think through milestones for buying a home in ~5 years vs building an emergency fund first.",
      intent: "WEALTH",
    });
    expect(out.text).toBe(
      "Name a few milestones, then sketch two scenarios: steady savings vs a year with higher costs.",
    );
    expect(out.metadata).toMatchObject({
      specialist: "LongTermFinancialPlanning",
      pillar: "wealth",
      department: "long_term_financial_planning",
      departmentIntent: "WEALTH",
    });
    expect(messagesCreate).toHaveBeenCalledWith(
      expect.objectContaining({ max_tokens: 768 }),
    );
  });
});
