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

  it("dispatches intent BUILD to Build & Ship", async () => {
    const out = await dispatchToAgent(
      {
        userProfileId: "00000000-0000-0000-0000-000000000001",
        telegramUserId: "1",
        rawMessage: "Scope milestones for my side project",
        intent: "BUILD",
      },
      "BUILD",
    );
    expect(out?.agentName).toBe("BuildShip");
    expect(out?.result.metadata).toMatchObject({
      specialist: "BuildShip",
      pillar: "wisdom",
      department: "build_ship",
    });
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

  it("dispatches intent LEARNING to Learning Plan specialist", async () => {
    const out = await dispatchToAgent(
      {
        userProfileId: "00000000-0000-0000-0000-000000000001",
        telegramUserId: "1",
        rawMessage: "Help me plan a curriculum for statistics",
        intent: "LEARNING",
      },
      "LEARNING",
    );
    expect(out?.agentName).toBe("LearningPlan");
    expect(out?.result.metadata).toMatchObject({
      specialist: "LearningPlan",
      pillar: "wisdom",
      department: "learning_plan",
    });
  });

  it("dispatches intent LEARNING to Learning Tracker when message looks like a review", async () => {
    const out = await dispatchToAgent(
      {
        userProfileId: "00000000-0000-0000-0000-000000000001",
        telegramUserId: "1",
        rawMessage: "Weekly learning review — what should I adjust?",
        intent: "LEARNING",
      },
      "LEARNING",
    );
    expect(out?.agentName).toBe("LearningTracker");
    expect(out?.result.metadata).toMatchObject({
      specialist: "LearningTracker",
      pillar: "wisdom",
      department: "tracker",
    });
  });

  it("dispatches intent HAPPINESS to Trip Designer", async () => {
    const out = await dispatchToAgent(
      {
        userProfileId: "00000000-0000-0000-0000-000000000001",
        telegramUserId: "1",
        rawMessage: "Help me sketch a long weekend in Lisbon",
        intent: "HAPPINESS",
      },
      "HAPPINESS",
    );
    expect(out?.agentName).toBe("TripDesigner");
    expect(out?.result.metadata).toMatchObject({
      specialist: "TripDesigner",
      pillar: "joy",
      department: "adventure_trips",
    });
  });

  it("dispatches intent CULTURE to Culture Recommender", async () => {
    const out = await dispatchToAgent(
      {
        userProfileId: "00000000-0000-0000-0000-000000000001",
        telegramUserId: "1",
        rawMessage: "Melancholy Sunday — a film and a poem?",
        intent: "CULTURE",
      },
      "CULTURE",
    );
    expect(out?.agentName).toBe("CultureRecommender");
    expect(out?.result.metadata).toMatchObject({
      specialist: "CultureRecommender",
      pillar: "joy",
      department: "culture",
    });
  });

  it("dispatches intent WEALTH to Wealth composite (default trading)", async () => {
    const out = await dispatchToAgent(
      {
        userProfileId: "00000000-0000-0000-0000-000000000001",
        telegramUserId: "1",
        rawMessage: "Review my trading journal habits",
        intent: "WEALTH",
      },
      "WEALTH",
    );
    expect(out?.agentName).toBe("WealthComposite");
    expect(out?.result.metadata).toMatchObject({
      specialist: "TradingCopilot",
      pillar: "wealth",
      department: "trading",
    });
  });
});
