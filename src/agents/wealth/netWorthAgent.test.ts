import { beforeEach, describe, expect, it, vi } from "vitest";

const messagesCreate = vi.fn();

let snapshotQueryResult: { data: unknown[] | null; error: { message: string } | null } = {
  data: [],
  error: null,
};

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
          limit: () => Promise.resolve(snapshotQueryResult),
        }),
      }),
    }),
  },
  redis: {},
}));

import { NET_WORTH_SYSTEM, runNetWorthAgent } from "./netWorthAgent.js";

describe("netWorthAgent", () => {
  beforeEach(() => {
    snapshotQueryResult = { data: [], error: null };
    messagesCreate.mockClear();
    messagesCreate.mockResolvedValue({
      content: [
        {
          type: "text",
          text: "Assets are what you own; liabilities are what you owe. Drift is when your mental map drifts from reality.",
        },
      ],
    });
  });

  it("NET_WORTH_SYSTEM covers assets vs liabilities, drift, reconciliation, and is not accounting software", () => {
    const s = NET_WORTH_SYSTEM.toLowerCase();
    expect(s).toMatch(/asset/);
    expect(s).toMatch(/liabilit/);
    expect(s).toMatch(/drift|reconcil/);
    expect(s).toMatch(/accounting software|bookkeeping/);
  });

  it("runNetWorthAgent returns expected metadata and calls Anthropic", async () => {
    const out = await runNetWorthAgent({
      userProfileId: "00000000-0000-0000-0000-000000000001",
      telegramUserId: "1",
      rawMessage: "How should I think about net worth vs cash flow?",
      intent: "WEALTH",
    });
    expect(out.text).toBe(
      "Assets are what you own; liabilities are what you owe. Drift is when your mental map drifts from reality.",
    );
    expect(out.metadata).toMatchObject({
      specialist: "NetWorth",
      pillar: "wealth",
      department: "net_worth",
      departmentIntent: "WEALTH",
    });
    expect(messagesCreate).toHaveBeenCalledWith(
      expect.objectContaining({ max_tokens: 768 }),
    );
  });

  it("does not fail when portfolio_snapshots query errors", async () => {
    snapshotQueryResult = { data: null, error: { message: "relation does not exist" } };
    const out = await runNetWorthAgent({
      userProfileId: "00000000-0000-0000-0000-000000000001",
      telegramUserId: "1",
      rawMessage: "Explain drift.",
      intent: "WEALTH",
    });
    expect(out.text.length).toBeGreaterThan(0);
    const userContent = messagesCreate.mock.calls[0]?.[0]?.messages?.[0]?.content as string;
    expect(userContent).not.toMatch(/portfolio_snapshots/);
  });

  it("appends optional snapshot rows to the user message when present", async () => {
    snapshotQueryResult = {
      data: [{ user_profile_id: "u1", notion_total: 42 }],
      error: null,
    };
    await runNetWorthAgent({
      userProfileId: "u1",
      telegramUserId: "1",
      rawMessage: "Help me reconcile mentally.",
      intent: "WEALTH",
    });
    const userContent = messagesCreate.mock.calls[0]?.[0]?.messages?.[0]?.content as string;
    expect(userContent).toContain("portfolio_snapshots");
    expect(userContent).toContain("notion_total");
  });
});
