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

import { FIRE_GOALS_SYSTEM, runFireGoalsAgent } from "./fireGoalsAgent.js";

describe("fireGoalsAgent", () => {
  beforeEach(() => {
    messagesCreate.mockResolvedValue({
      content: [
        {
          type: "text",
          text: "Savings rate is the share of income you don’t spend — higher rate often means reaching independence sooner in principle, but that’s illustrative, not a plan.",
        },
      ],
    });
  });

  it("FIRE_GOALS_SYSTEM requires illustrative disclaimer and discourages definitive advice", () => {
    const s = FIRE_GOALS_SYSTEM.toLowerCase();
    expect(s).toMatch(/illustrative|not a financial plan|disclaimer/);
    expect(s).toMatch(/savings rate|trade-?off|timeline/i);
    expect(s).toMatch(/FIRE|financial independence/i);
    expect(s).toMatch(/jurisdiction|professional|licensed|tax|legal/);
  });

  it("runFireGoalsAgent returns expected metadata and calls Anthropic", async () => {
    const out = await runFireGoalsAgent({
      userProfileId: "00000000-0000-0000-0000-000000000001",
      telegramUserId: "1",
      rawMessage:
        "Explain how savings rate relates to a rough timeline for FI — I’m not looking for a plan, just intuition.",
      intent: "WEALTH",
    });
    expect(out.text).toBe(
      "Savings rate is the share of income you don’t spend — higher rate often means reaching independence sooner in principle, but that’s illustrative, not a plan.",
    );
    expect(out.metadata).toMatchObject({
      specialist: "FireGoals",
      pillar: "wealth",
      department: "fire",
      departmentIntent: "WEALTH",
    });
    expect(messagesCreate).toHaveBeenCalledWith(
      expect.objectContaining({ max_tokens: 768 }),
    );
  });
});
