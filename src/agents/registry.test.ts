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
          order: () => ({
            limit: () => Promise.resolve({ data: [], error: null }),
          }),
        }),
      }),
    }),
  },
  redis: {},
}));

import { dispatchToAgent } from "./registry.js";
import { PLANNER_SYSTEM, runPlannerAgent } from "./planning/plannerAgent.js";

describe("Planner routing and behaviour", () => {
  beforeEach(() => {
    messagesCreate.mockResolvedValue({
      content: [{ type: "text", text: "Prioritise deep work first." }],
    });
  });

  it("PLANNER_SYSTEM includes locked-day guidance", () => {
    expect(PLANNER_SYSTEM.toLowerCase()).toContain("locked");
  });

  it("runPlannerAgent requests a bounded max_tokens", async () => {
    await runPlannerAgent({
      userProfileId: "00000000-0000-0000-0000-000000000001",
      telegramUserId: "1",
      rawMessage: "What should I focus on today?",
      intent: "PLANNING",
    });
    expect(messagesCreate).toHaveBeenCalledWith(
      expect.objectContaining({ max_tokens: 768 }),
    );
  });

  it("dispatches intent PLANNING to Planner (not placeholder)", async () => {
    const out = await dispatchToAgent(
      {
        userProfileId: "00000000-0000-0000-0000-000000000001",
        telegramUserId: "1",
        rawMessage: "Help me plan my week",
        intent: "PLANNING",
      },
      "PLANNING",
    );
    expect(out?.agentName).toBe("Planner");
    expect(out?.result.metadata).toMatchObject({ department: "PLANNING" });
  });

  it("dispatches intent NOTION to Notion specialist", async () => {
    const out = await dispatchToAgent(
      {
        userProfileId: "00000000-0000-0000-0000-000000000001",
        telegramUserId: "1",
        rawMessage: "notion ping",
        intent: "NOTION",
      },
      "NOTION",
    );
    expect(out?.agentName).toBe("Notion");
    expect(out?.result.metadata).toMatchObject({ specialist: "Notion", department: "NOTION" });
  });
});
