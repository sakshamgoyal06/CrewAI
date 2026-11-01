import { beforeEach, describe, expect, it, vi } from "vitest";

const createMock = vi.hoisted(() => vi.fn());
const parseRoutingContextMock = vi.hoisted(() => vi.fn());

const minimalGrowth = vi.hoisted(() => ({
  localTime: { dateKey: "2026-08-18", hour: 12, minute: 0, isLateEvening: false },
  dayFrame: { tone: "unknown" as const, morningNotes: [] as string[] },
  northStar: { goals: [] as Array<{ title: string; pillar: string; timeframe: string; status: string }> },
  operations: {
    todayCommitments: [] as Array<{ title: string; status: string; pillar: string }>,
    overdueCount: 0,
    errands: [] as Array<{ source: "task"; title: string }>,
    slippingRoutines: [] as Array<{ activityKey: string; activity: string; recentMisses: number }>,
  },
  projects: { active: [] as Array<{ title: string; pillar: string; status: string }> },
  lists: [] as Array<{ slug: string; displayName: string; openCount: number }>,
  listHighlights: [] as Array<{ slug: string; title: string }>,
  behavior: {
    issues: [] as string[],
    wins: [] as string[],
    dailyLogSnippets: [] as Array<{ date: string; snippet: string }>,
    narrativeBullets: [] as string[],
  },
  kpis: {
    pillarStatus: [] as Array<{ pillar: string; status: string }>,
    topRoutines: [] as Array<{ activity: string; pillar: string; done: number; missed: number; total: number }>,
  },
}));

vi.mock("../tools/clients.js", () => ({
  anthropic: { messages: { create: createMock } },
  supabase: {},
  redis: {},
}));

vi.mock("./routing/routingContextParser.js", () => ({
  parseRoutingContext: (...args: unknown[]) => parseRoutingContextMock(...args),
  NEUTRAL_ROUTING_CONTEXT: {
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
    prefer_intent_health: false,
    consult_pillars: [],
    magnus_capabilities: [],
  },
  routingContextToIntentHints: (signals: Record<string, unknown>) => ({
    explicit_meal_log: Boolean(signals.explicit_meal_log),
    looks_like_meal_log_read: Boolean(signals.looks_like_meal_log_read),
    looks_like_youtube_action: Boolean(signals.looks_like_youtube_action),
    looks_like_magnus_tool_action: Boolean(signals.looks_like_magnus_tool_action),
    looks_like_magnus_tool_continuation: Boolean(signals.looks_like_magnus_tool_continuation),
    looks_like_health_fitness_read: Boolean(signals.looks_like_health_fitness_read),
    looks_like_wealth_portfolio_read: Boolean(signals.looks_like_wealth_portfolio_read),
    holistic_day_ask: Boolean(signals.holistic_day_ask),
    saved_media_pick: Boolean(signals.saved_media_pick),
    schedule_accuracy_challenge: Boolean(signals.schedule_accuracy_challenge),
    compound_action: Boolean(signals.compound_action),
  }),
}));

import { resolveIntentNaturalLanguage } from "./orchestratorIntent.js";

function classifiedAs(intent: string): void {
  createMock.mockResolvedValue({ content: [{ type: "text", text: intent }] });
}

function mockRoutingSignals(overrides: Record<string, unknown> = {}): void {
  parseRoutingContextMock.mockResolvedValue({
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
    prefer_intent_health: false,
    consult_pillars: [],
    magnus_capabilities: [],
    ...overrides,
  });
}

describe("resolveIntentNaturalLanguage", () => {
  beforeEach(() => {
    createMock.mockReset();
    parseRoutingContextMock.mockReset();
    mockRoutingSignals();
  });

  it("passes through what the classifier decides", async () => {
    classifiedAs("WEALTH");
    await expect(resolveIntentNaturalLanguage("am I saving enough?")).resolves.toBe("WEALTH");
  });

  it("falls back to GENERAL on an unrecognised label", async () => {
    classifiedAs("CULTURE");
    await expect(resolveIntentNaturalLanguage("what should I read?")).resolves.toBe("GENERAL");
  });

  it("uses routing context parser before the classifier", async () => {
    mockRoutingSignals({ looks_like_youtube_action: true });
    classifiedAs("GENERAL");
    await expect(resolveIntentNaturalLanguage("search YouTube for lo-fi study beats")).resolves.toBe(
      "GENERAL",
    );
    expect(parseRoutingContextMock).toHaveBeenCalled();
    expect(createMock).toHaveBeenCalled();
  });

  it("short-circuits to HEALTH for explicit meal log without calling classifier", async () => {
    mockRoutingSignals({ explicit_meal_log: true });
    await expect(resolveIntentNaturalLanguage("meal: two eggs and toast")).resolves.toBe("HEALTH");
    expect(parseRoutingContextMock).toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
  });

  it("includes routing context hints in the classifier payload", async () => {
    mockRoutingSignals({ looks_like_youtube_action: true });
    classifiedAs("GENERAL");
    await resolveIntentNaturalLanguage("search YouTube for lo-fi study beats");
    const payload = JSON.parse(String(createMock.mock.calls[0]![0].messages[0].content));
    expect(payload.routing_hints.looks_like_youtube_action).toBe(true);

    createMock.mockReset();
    mockRoutingSignals({ looks_like_health_fitness_read: true });
    classifiedAs("HEALTH");
    await resolveIntentNaturalLanguage("Pull data from hevy");
    const hevyPayload = JSON.parse(String(createMock.mock.calls[0]![0].messages[0].content));
    expect(hevyPayload.routing_hints.looks_like_health_fitness_read).toBe(true);

    createMock.mockReset();
    mockRoutingSignals({ looks_like_wealth_portfolio_read: true });
    classifiedAs("WEALTH");
    await resolveIntentNaturalLanguage("show my kite portfolio");
    const wealthPayload = JSON.parse(String(createMock.mock.calls[0]![0].messages[0].content));
    expect(wealthPayload.routing_hints.looks_like_wealth_portfolio_read).toBe(true);
  });

  it("leaves routing to the classifier when hints are ambiguous", async () => {
    classifiedAs("HAPPINESS");
    await expect(
      resolveIntentNaturalLanguage("where should we eat on Saturday?"),
    ).resolves.toBe("HAPPINESS");

    classifiedAs("HAPPINESS");
    await expect(
      resolveIntentNaturalLanguage("search YouTube for lo-fi study beats"),
    ).resolves.toBe("HAPPINESS");
  });

  it("asks for a single token, keeping the classify call cheap", async () => {
    classifiedAs("HEALTH");
    await resolveIntentNaturalLanguage("should I train today?");
    expect(createMock).toHaveBeenCalledWith(expect.objectContaining({ max_tokens: 16 }));
  });

  it("forces HEALTH on yes when meal log confirm is pending", async () => {
    await expect(
      resolveIntentNaturalLanguage("yes", {
        routingContext: {
          userProfileId: "u1",
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
          pending: { mealLogConfirm: { preview: "burrito bowl" } },
          activeWork: { activeProjects: [], openCommitmentCount: 0, overdueCommitmentCount: 0 },
          standing: { programNotes: [], routingFacts: [] },
          growth: minimalGrowth,
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
          parserSignals: {
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
            prefer_intent_health: false,
            consult_pillars: [],
            magnus_capabilities: [],
          },
          gaps: [],
        },
      }),
    ).resolves.toBe("HEALTH");
    expect(createMock).not.toHaveBeenCalled();
  });

  it("includes routing_context in classifier payload when provided", async () => {
    classifiedAs("GENERAL");
    await resolveIntentNaturalLanguage("what's on tomorrow?", {
      routingContext: {
        userProfileId: "u1",
        assembledAt: new Date().toISOString(),
        identity: {
          timezone: "Asia/Kolkata",
          northStarGoal: "Ship Magnus",
          healthOnboardingComplete: true,
        },
        integrations: {
          notion: "connected",
          googleCalendar: "connected",
          youtube: "not_connected",
          hevy: "connected",
          zerodha: "not_connected",
        },
        recentTurns: [],
        pending: {},
        activeWork: { activeProjects: [], openCommitmentCount: 2, overdueCommitmentCount: 0 },
        standing: { programNotes: [], routingFacts: [] },
        growth: minimalGrowth,
        routingHints: {
          explicit_meal_log: false,
          looks_like_meal_log_read: false,
          looks_like_youtube_action: false,
          looks_like_magnus_tool_action: false,
          looks_like_magnus_tool_continuation: false,
          looks_like_health_fitness_read: false,
          looks_like_wealth_portfolio_read: false,
          holistic_day_ask: true,
          saved_media_pick: false,
          schedule_accuracy_challenge: false,
          compound_action: false,
        },
        parserSignals: {
          explicit_meal_log: false,
          looks_like_meal_log_read: false,
          looks_like_youtube_action: false,
          looks_like_magnus_tool_action: false,
          looks_like_magnus_tool_continuation: false,
          looks_like_health_fitness_read: false,
          looks_like_wealth_portfolio_read: false,
          holistic_day_ask: true,
          saved_media_pick: false,
          schedule_accuracy_challenge: false,
          compound_action: false,
          prefer_intent_health: false,
          consult_pillars: [],
          magnus_capabilities: [],
        },
        gaps: [],
      },
    });
    const payload = JSON.parse(String(createMock.mock.calls[0]![0].messages[0].content));
    expect(payload.routing_context.integrations.googleCalendar).toBe("connected");
    expect(payload.routing_context.active_work.open_commitment_count).toBe(2);
  });
});
