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

vi.mock("./context/assembleRoutingContext.js", () => ({
  assembleRoutingContext: vi.fn().mockResolvedValue({
    userProfileId: "00000000-0000-0000-0000-000000000001",
    assembledAt: new Date().toISOString(),
    identity: {
      timezone: "UTC",
      northStarGoal: "",
      healthOnboardingComplete: true,
    },
    integrations: {
      notion: "not_connected",
      googleCalendar: "not_connected",
      youtube: "not_connected",
      hevy: "not_connected",
      zerodha: "not_connected",
    },
    recentTurns: [],
    pending: {},
    activeWork: { activeProjects: [], openCommitmentCount: 0, overdueCommitmentCount: 0 },
    standing: { programNotes: [], routingFacts: [] },
    growth: {
      localTime: { dateKey: "2026-08-18", hour: 12, minute: 0, isLateEvening: false },
      dayFrame: { tone: "unknown", morningNotes: [] },
      northStar: { goals: [] },
      operations: { todayCommitments: [], overdueCount: 0, errands: [], slippingRoutines: [] },
      projects: { active: [] },
      lists: [],
      listHighlights: [],
      behavior: { issues: [], wins: [], dailyLogSnippets: [], narrativeBullets: [] },
      kpis: { pillarStatus: [], topRoutines: [] },
    },
    routingHints: {
      explicit_meal_log: false,
      looks_like_meal_log_read: false,
      looks_like_youtube_action: false,
      looks_like_magnus_tool_action: false,
      looks_like_magnus_tool_continuation: false,
      looks_like_health_fitness_read: false,
      looks_like_wealth_portfolio_read: false,
      holistic_day_ask: false,
      saved_media_pick: false,
      schedule_accuracy_challenge: false,
      compound_action: false,
    },
    gaps: [],
  }),
}));

vi.mock("../projects/projectSessionPrelude.js", () => ({
  tryResolveActiveProjectSessionTurn: vi.fn().mockResolvedValue({ handled: false }),
}));

vi.mock("../jobs/handleWinConditionPending.js", () => ({
  handleWinConditionPendingTurn: vi.fn().mockResolvedValue({ handled: false }),
  armWinConditionPendingAfterBrief: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./routing/handleReversibleAction.js", () => ({
  handleReversibleActionTurn: vi.fn().mockResolvedValue({ handled: false }),
}));

vi.mock("./routing/pillarStrategy/buildRoutingHints.js", () => ({
  buildRoutingHints: vi.fn().mockResolvedValue({
    has_meal_photo: false,
    photo_purpose: null,
    photo_description_preview: null,
    photo_extracted_items: [],
    explicit_meal_log: false,
    active_meal_plan_session: false,
    meal_plan_session_step: null,
    active_project_session: false,
    project_session_step: null,
    active_projects: [],
    previous_turn_intent: null,
    previous_turn_capability: null,
    previous_turn_was_meal_log: false,
    previous_turn_meal_plan_locked: false,
    google_calendar_connected: false,
    youtube_connected: false,
    notion_connected: false,
    hevy_connected: false,
    zerodha_connected: false,
    recent_turns: [],
    holistic_day_ask: false,
    saved_media_pick: false,
    schedule_accuracy_challenge: false,
    compound_action: false,
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
    process.env.MAGNUS_PILLAR_PLAN_COMPOSE = "false";
    createMock.mockReset();
    createMock.mockImplementation(async () => replyText("GENERAL"));
    vi.mocked(loadMemoryContext).mockReset();
    vi.mocked(loadMemoryContext).mockResolvedValue(defaultMemoryPayload);
  });

  it("answers GENERAL as Magnus himself, with no specialist recorded", async () => {
    createMock
      .mockResolvedValueOnce(replyText("GENERAL"))
      .mockResolvedValueOnce({
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              confidence: 0.9,
              steps: [{ capability: "conversation", args: {} }],
            }),
          },
        ],
      })
      .mockResolvedValueOnce(replyText("Two things today."));

    const out = await runOrchestratorReply({ userMessage: "how's my day?", ...TURN });

    expect(out.intent).toBe("GENERAL");
    expect(out.replyText).toBe("Two things today.");
    expect(out.delegatedAgent).toBeUndefined();
    expect(out.agentMetadata?.specialist).toBe("Magnus");
  });

  it.each([
    ["WEALTH", "Wealth", "coaching"],
    ["HAPPINESS", "Happiness", "recommendations"],
    ["WISDOM", "Wisdom", "coaching"],
  ])("routes %s to the %s pillar without telling the user", async (intent, agentName, capability) => {
    createMock
      .mockResolvedValueOnce(replyText(intent))
      .mockResolvedValueOnce({
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              confidence: 0.9,
              steps: [{ capability, args: {} }],
            }),
          },
        ],
      })
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
      .mockResolvedValueOnce({
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              confidence: 0.9,
              steps: [{ capability: "coaching", args: {} }],
            }),
          },
        ],
      })
      .mockResolvedValueOnce(replyText("ok"));

    await runOrchestratorReply({ userMessage: "help me learn rust", ...TURN });

    expect(vi.mocked(loadMemoryContext)).toHaveBeenCalledTimes(1);
  });
});
