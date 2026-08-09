import { beforeEach, describe, expect, it, vi } from "vitest";

const createMock = vi.hoisted(() =>
  vi.fn().mockImplementation(async () => ({
    content: [{ type: "text" as const, text: "GENERAL" }],
  })),
);

vi.mock("../tools/clients.js", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../tools/clients.js")>();
  return {
    ...mod,
    anthropic: {
      ...mod.anthropic,
      messages: {
        ...mod.anthropic.messages,
        create: createMock,
      },
    },
  };
});

vi.mock("./health/healthOnboarding.js", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./health/healthOnboarding.js")>();
  return {
    ...mod,
    fetchUserHealthProfile: vi.fn().mockResolvedValue(null),
  };
});

const { defaultMemoryPayload } = vi.hoisted(() => {
  const defaultMemoryPayload = {
    purpose: "chat" as const,
    loadedAt: new Date().toISOString(),
    profile: null,
    recentSignals: { recentChatTurns: [] },
    rollingSummaries: {},
    activeGoals: [],
    joy: {},
    patterns: [],
    gaps: [],
  };
  return { defaultMemoryPayload };
});

vi.mock("./memory/memoryAgent.js", () => ({
  loadMemoryContext: vi.fn().mockResolvedValue(defaultMemoryPayload),
  buildMemoryPackage: vi.fn().mockResolvedValue({
    verbatimTurns: [],
    semanticFacts: [],
    memoryBlock: "",
    retrievalProfile: {
      includeDailyLogs: true,
      includeDailyScores: true,
      includeGoals: true,
      includeJoy: true,
      includePatterns: true,
      includeRollingSummaries: true,
      includeSemanticFacts: true,
      includeGaps: false,
      includeChatSnippetsInBlock: false,
      memoryBlockMaxChars: 6000,
      verbatimTurnLimit: 14,
    },
    chronologicalTurns: [],
  }),
  buildAgentMessages: (_ctx: unknown, content: string) => [{ role: "user" as const, content }],
  augmentUserWithMemory: (msg: string, _block?: string) => msg,
  intentToMemoryPurpose: () => "chat" as const,
}));

vi.mock("../tools/routingContext.js", () => ({
  fetchRecentRoutingTurns: vi.fn().mockResolvedValue([]),
}));

vi.mock("../nutrition/planning/mealPlanningSessionStore.js", () => ({
  getActiveMealPlanSession: vi.fn().mockResolvedValue(null),
}));

vi.mock("../pillars/health/references/loadHealthReferences.js", () => ({
  loadHealthReferenceBlock: vi.fn().mockResolvedValue({ block: "", sources: [] }),
}));

vi.mock("./health/mealPlanningAgent.js", () => ({
  executeMealPlanningCapability: vi.fn().mockResolvedValue({
    text: "Meal planning cancelled. Your last locked plan (if any) is unchanged.",
    metadata: { meal_plan_cancelled: true },
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

import { loadMemoryContext } from "./memory/memoryAgent.js";
import { executeMealPlanningCapability } from "./health/mealPlanningAgent.js";
import { runOrchestratorReply } from "./magnusOrchestrator.js";

const TURN = {
  userProfileId: "00000000-0000-0000-0000-000000000001",
  telegramUserId: "12345",
  timezone: "Asia/Kolkata",
};

function replyText(text: string): { content: { type: "text"; text: string }[] } {
  return { content: [{ type: "text" as const, text }] };
}

describe("runOrchestratorReply", () => {
  beforeEach(() => {
    process.env.MAGNUS_PILLAR_STRATEGY_PARSER = "false";
    createMock.mockReset();
    createMock.mockImplementation(async () => replyText("GENERAL"));
    vi.mocked(loadMemoryContext).mockReset();
    vi.mocked(loadMemoryContext).mockResolvedValue(defaultMemoryPayload);
  });

  it("answers GENERAL as Magnus himself, with no specialist recorded", async () => {
    createMock
      .mockResolvedValueOnce(replyText("GENERAL"))
      .mockResolvedValueOnce(replyText("Two things today."));

    const out = await runOrchestratorReply({ userMessage: "how's my day?", ...TURN });

    expect(out.intent).toBe("GENERAL");
    expect(out.replyText).toBe("Two things today.");
    expect(out.delegatedAgent).toBeUndefined();
    expect(out.agentMetadata?.specialist).toBe("Magnus");
  });

  it.each([
    ["WEALTH", "Wealth"],
    ["HAPPINESS", "Happiness"],
    ["WISDOM", "Wisdom"],
  ])("routes %s to the %s pillar without telling the user", async (intent, agentName) => {
    createMock
      .mockResolvedValueOnce(replyText(intent))
      .mockResolvedValueOnce(replyText("Here is the answer."));

    const out = await runOrchestratorReply({ userMessage: "a question", ...TURN });

    expect(out.intent).toBe(intent);
    expect(out.delegatedAgent).toBe(agentName);
    expect(out.replyText).toBe("Here is the answer.");
    // Routing is internal: it appears in metadata, never in the reply body.
    expect(out.replyText).not.toMatch(/specialist|routing|pillar/i);
  });

  it("loads memory once per turn", async () => {
    createMock
      .mockResolvedValueOnce(replyText("WISDOM"))
      .mockResolvedValueOnce(replyText("ok"));

    await runOrchestratorReply({ userMessage: "help me learn rust", ...TURN });

    expect(vi.mocked(loadMemoryContext)).toHaveBeenCalledTimes(1);
  });

  it("fast-paths cancel planning before intent classification", async () => {
    const out = await runOrchestratorReply({ userMessage: "cancel planning", ...TURN });

    expect(out.intent).toBe("HEALTH");
    expect(out.replyText).toMatch(/cancelled/i);
    expect(out.agentMetadata?.meal_planning_fast_path).toBe(true);
    expect(vi.mocked(executeMealPlanningCapability)).toHaveBeenCalledOnce();
    expect(createMock).not.toHaveBeenCalled();
    expect(vi.mocked(loadMemoryContext)).not.toHaveBeenCalled();
  });
});
