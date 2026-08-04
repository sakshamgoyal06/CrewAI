/**
 * Regression tests for PR #48 tool routing: list / LifeOS / Notion → GENERAL (Magnus tools).
 *
 * Run: npm run test:wiring
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const classifyMock = vi.hoisted(() =>
  vi.fn().mockImplementation(async () => ({
    content: [{ type: "text" as const, text: "GENERAL" }],
  })),
);
const runMagnusAgentMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    text: "Magnus handled it.",
    metadata: { specialist: "Magnus", tools_used: ["list_items"] },
  }),
);
const dispatchToAgentMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    agentName: "Happiness",
    result: { text: "Happiness specialist reply.", metadata: { specialist: "Happiness" } },
  }),
);
const fetchRecentRoutingTurnsMock = vi.hoisted(() => vi.fn().mockResolvedValue([]));

vi.mock("../tools/clients.js", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../tools/clients.js")>();
  return {
    ...mod,
    anthropic: {
      ...mod.anthropic,
      messages: { create: classifyMock },
    },
  };
});

vi.mock("./magnusAgent.js", () => ({
  runMagnusAgent: runMagnusAgentMock,
}));

vi.mock("./registry.js", () => ({
  dispatchToAgent: dispatchToAgentMock,
}));

vi.mock("./health/healthOnboarding.js", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./health/healthOnboarding.js")>();
  return {
    ...mod,
    fetchUserHealthProfile: vi.fn().mockResolvedValue(null),
  };
});

vi.mock("../tools/routingContext.js", () => ({
  fetchRecentRoutingTurns: fetchRecentRoutingTurnsMock,
}));

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
  augmentUserWithMemory: (msg: string) => msg,
  intentToMemoryPurpose: () => "chat" as const,
}));

vi.mock("../pillars/wealth/zerodha/index.js", () => ({
  fetchKitePortfolioSnapshot: vi.fn().mockResolvedValue({
    ok: false,
    error: "not_connected",
    meta: { kite: "not_connected" },
  }),
  formatKitePortfolioForPrompt: vi.fn().mockReturnValue(""),
}));

import { MAGNUS_CORE_SYSTEM } from "./magnusCorePrompt.js";
import { runOrchestratorReply } from "./magnusOrchestrator.js";

const TURN = {
  userProfileId: "00000000-0000-0000-0000-000000000001",
  telegramUserId: "12345",
  timezone: "Asia/Kolkata",
};

function classifyAs(intent: string): void {
  classifyMock.mockResolvedValueOnce({
    content: [{ type: "text", text: intent }],
  });
}

describe("Magnus tool wiring (orchestrator)", () => {
  beforeEach(() => {
    classifyMock.mockReset();
    classifyMock.mockImplementation(async () => ({
      content: [{ type: "text", text: "GENERAL" }],
    }));
    runMagnusAgentMock.mockClear();
    dispatchToAgentMock.mockClear();
    fetchRecentRoutingTurnsMock.mockReset();
    fetchRecentRoutingTurnsMock.mockResolvedValue([]);
  });

  it.each([
    ["recommend a thriller from my watchlist", "list routing"],
    ["log joy tank 72", "LifeOS joy tank"],
    ["health pillar is at_risk today", "LifeOS pillar status"],
    ["add goal: emergency fund", "LifeOS goals"],
    ["connect notion", "Notion connect"],
  ])("routes %s to Magnus even when classifier says HAPPINESS (%s)", async (message) => {
    classifyAs("HAPPINESS");

    const out = await runOrchestratorReply({ userMessage: message, ...TURN });

    expect(out.intent).toBe("GENERAL");
    expect(runMagnusAgentMock).toHaveBeenCalledOnce();
    expect(dispatchToAgentMock).not.toHaveBeenCalled();
    expect(out.delegatedAgent).toBeUndefined();
    expect(out.agentMetadata?.specialist).toBe("Magnus");
  });

  it("keeps pure taste talk on Happiness when classifier agrees", async () => {
    classifyAs("HAPPINESS");

    const out = await runOrchestratorReply({
      userMessage: "recommend a film like Arrival",
      ...TURN,
    });

    expect(out.intent).toBe("HAPPINESS");
    expect(dispatchToAgentMock).toHaveBeenCalledOnce();
    expect(runMagnusAgentMock).not.toHaveBeenCalled();
    expect(out.delegatedAgent).toBe("Happiness");
  });

  it("routes list follow-up affirmatives to Magnus after a list tool turn", async () => {
    classifyAs("HAPPINESS");
    fetchRecentRoutingTurnsMock.mockResolvedValueOnce([
      {
        role: "assistant",
        content: "Want me to add Dune to your readlist?",
        metadata: { tools_used: ["list_items"] },
      },
    ]);

    const out = await runOrchestratorReply({ userMessage: "Yes, add it", ...TURN });

    expect(out.intent).toBe("GENERAL");
    expect(runMagnusAgentMock).toHaveBeenCalledOnce();
    expect(dispatchToAgentMock).not.toHaveBeenCalled();
  });
});

describe("Magnus tool wiring (prompt exposure)", () => {
  it("documents LifeOS and list recommendation tools in the core prompt", () => {
    for (const tool of [
      "recommend_list_items",
      "update_pillar_status",
      "log_joy_tank",
      "list_lifeos_goals",
    ]) {
      expect(MAGNUS_CORE_SYSTEM).toContain(tool);
    }
  });
});
