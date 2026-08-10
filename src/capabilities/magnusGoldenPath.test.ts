/**
 * Golden-path integration: user query → runOrchestratorReply → assert routing, tools, one voice.
 * LLM responses are fixture-driven (simulates correct classify + plan parser + tool choice).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { GoldenPathScenario } from "./goldenPathScenarios.js";
import { GOLDEN_PATH_SCENARIOS } from "./goldenPathScenarios.js";
import { assertGoldenPathOutcome } from "./goldenPathAssertions.js";

const state = vi.hoisted(() => ({
  scenario: null as GoldenPathScenario | null,
  anthropicCalls: 0,
  defaultMemoryPayload: {
    purpose: "chat" as const,
    loadedAt: new Date().toISOString(),
    profile: null,
    recentSignals: { recentChatTurns: [] },
    rollingSummaries: {},
    activeGoals: [],
    joy: {},
    patterns: [],
    gaps: [],
  },
}));

const createMock = vi.hoisted(() => vi.fn());
const readCalendarMock = vi.hoisted(() => vi.fn());
const createCalendarMock = vi.hoisted(() => vi.fn());
const updateCalendarMock = vi.hoisted(() => vi.fn());
const deleteCalendarMock = vi.hoisted(() => vi.fn());
const logNoteMock = vi.hoisted(() => vi.fn());
const listEventsMock = vi.hoisted(() => vi.fn());
const logEventMock = vi.hoisted(() => vi.fn());
const rescheduleEventMock = vi.hoisted(() => vi.fn());
const updateEventMock = vi.hoisted(() => vi.fn());
const youtubeSearchMock = vi.hoisted(() => vi.fn());
const youtubePlaylistMock = vi.hoisted(() => vi.fn());
const youtubeBookmarkMock = vi.hoisted(() => vi.fn());
const youtubeCueMock = vi.hoisted(() => vi.fn());
const listItemsMock = vi.hoisted(() => vi.fn());
const addListItemMock = vi.hoisted(() => vi.fn());
const recommendListMock = vi.hoisted(() => vi.fn());
const createListMock = vi.hoisted(() => vi.fn());
const logDailyCheckinMock = vi.hoisted(() => vi.fn());
const logJoyTankMock = vi.hoisted(() => vi.fn());
const updatePillarMock = vi.hoisted(() => vi.fn());
const addGoalMock = vi.hoisted(() => vi.fn());
const connectNotionMock = vi.hoisted(() => vi.fn());
const syncNotionMock = vi.hoisted(() => vi.fn());
const setupNotionMock = vi.hoisted(() => vi.fn());
const manageProactiveMock = vi.hoisted(() => vi.fn());
const connectKiteMock = vi.hoisted(() => vi.fn());
const dayOverviewMock = vi.hoisted(() => vi.fn());
const mealLogMock = vi.hoisted(() => vi.fn());
const mealPhotoMock = vi.hoisted(() => vi.fn());

function textReply(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function toolReply(name: string, input: Record<string, unknown> = {}) {
  return {
    content: [{ type: "tool_use" as const, id: `tool_${name}`, name, input }],
  };
}

function userText(messages: unknown): string {
  const msgs = messages as { role: string; content: unknown }[];
  const last = msgs[msgs.length - 1];
  if (!last) return "";
  if (typeof last.content === "string") return last.content;
  if (Array.isArray(last.content)) {
    for (const block of last.content) {
      if (block && typeof block === "object" && "text" in block) {
        return String((block as { text: string }).text);
      }
    }
  }
  return "";
}

vi.mock("../tools/clients.js", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../tools/clients.js")>();
  return {
    ...mod,
    anthropic: {
      ...mod.anthropic,
      messages: { create: createMock },
    },
  };
});

vi.mock("../agents/health/healthOnboarding.js", () => ({
  fetchUserHealthProfile: vi.fn().mockResolvedValue({
    onboarding_completed_at: "2026-01-01T00:00:00Z",
    fitness_goals: "strength",
    diet_type: "balanced",
    meal_timing: "standard",
    restrictions: null,
  }),
  formatHealthPreferencesForPrompt: vi.fn().mockReturnValue(""),
  runHealthOnboardingTurn: vi.fn(),
  startHealthOnboarding: vi.fn(),
}));

vi.mock("../agents/memory/memoryAgent.js", () => ({
  loadMemoryContext: vi.fn().mockResolvedValue(state.defaultMemoryPayload),
  buildMemoryPackage: vi.fn().mockResolvedValue({
    verbatimTurns: [],
    semanticFacts: [],
    memoryBlock: "",
    retrievalProfile: {},
    chronologicalTurns: [],
  }),
  buildAgentMessages: (_ctx: unknown, content: string) => [{ role: "user" as const, content }],
  augmentUserWithMemory: (msg: string) => msg,
  intentToMemoryPurpose: () => "chat" as const,
}));

vi.mock("../tools/routingContext.js", () => ({
  fetchRecentRoutingTurns: vi.fn().mockResolvedValue([]),
}));

vi.mock("../projects/projectSessionPrelude.js", () => ({
  tryResolveActiveProjectSessionTurn: vi.fn().mockResolvedValue({ handled: false }),
}));

vi.mock("../agents/routing/pillarStrategy/buildRoutingHints.js", () => ({
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
    google_calendar_connected: true,
    youtube_connected: true,
    notion_connected: true,
    hevy_connected: false,
    zerodha_connected: false,
    recent_turns: [],
  }),
}));

vi.mock("../pillars/health/references/loadHealthReferences.js", () => ({
  loadHealthReferenceBlock: vi.fn().mockResolvedValue({ block: "", gaps: [] }),
}));

vi.mock("../agents/health/nutritionOrchestrated.js", () => ({
  runOrchestratedMealLogTurn: (...args: unknown[]) => mealLogMock(...args),
  runMealPhotoLogTurn: (...args: unknown[]) => mealPhotoMock(...args),
}));

vi.mock("../agents/health/mealHistoryAgent.js", () => ({
  executeMealHistoryCapability: vi.fn().mockImplementation(async (_ctx, cap) => ({
    text: `Meal history (${cap}).`,
    metadata: { specialist: "MealHistory", meal_history: cap },
  })),
}));

vi.mock("../agents/health/mealTargetAgent.js", () => ({
  executeMealTargetCapability: vi.fn().mockImplementation(async (_ctx, cap) => ({
    text: `Targets (${cap}).`,
    metadata: { specialist: "MealTargets", meal_targets: cap },
  })),
}));

vi.mock("../agents/health/mealPlanningAgent.js", () => ({
  executeMealPlanningCapability: vi.fn().mockResolvedValue({
    text: "Which meals each day?",
    metadata: { specialist: "MealPlanner", meal_plan_step: "slots" },
  }),
}));

vi.mock("../agents/health/mealPlanReadAgent.js", () => ({
  executeMealPlanReadCapability: vi.fn().mockImplementation(async (_ctx, cap) => ({
    text: `Meal plan read (${cap}).`,
    metadata: { specialist: "MealPlanRead", meal_plan: cap },
  })),
}));

vi.mock("../agents/health/healthJournalAgent.js", () => ({
  runHealthJournalAgent: vi.fn().mockResolvedValue({
    text: "Health journal saved.",
    metadata: { specialist: "HealthJournal" },
  }),
}));

vi.mock("../pillars/health/workouts/agents/hevyWriteAgent.js", () => ({
  tryHevyWriteAgent: vi.fn().mockResolvedValue({
    text: "Hevy command noted.",
    metadata: { specialist: "HevyWrite", hevy_write: false },
  }),
}));

vi.mock("../pillars/health/workouts/agents/fitnessAgent.js", () => ({
  runFitnessCapability: vi.fn().mockResolvedValue({
    text: "Fitness coaching reply.",
    metadata: { specialist: "Fitness" },
  }),
}));

vi.mock("../agents/health/alternatesRecommenderAgent.js", () => ({
  runAlternatesRecommenderAgent: vi.fn().mockResolvedValue({
    text: "Try olive oil instead.",
    metadata: { specialist: "AlternatesRecommender", health_order: "alternates" },
  }),
}));

vi.mock("../agents/health/nutritionAgent.js", () => ({
  runNutritionCapability: vi.fn().mockResolvedValue({
    text: "Nutrition advice reply.",
    metadata: { specialist: "Nutrition" },
  }),
}));

vi.mock("../agents/health/energyAgent.js", () => ({
  runEnergyAgent: vi.fn().mockResolvedValue({
    text: "Recovery tips reply.",
    metadata: { specialist: "Energy" },
  }),
}));

vi.mock("../agents/health/longTermHealthPlanningAgent.js", () => ({
  runLongTermHealthPlanningAgent: vi.fn().mockResolvedValue({
    text: "Season plan outline.",
    metadata: { specialist: "LongTermHealthPlanning" },
  }),
}));

vi.mock("../agents/tools/calendarTool.js", () => ({
  readCalendarEvents: readCalendarMock,
  createCalendarEvent: createCalendarMock,
  updateCalendarEvent: updateCalendarMock,
  deleteCalendarEvent: deleteCalendarMock,
}));

vi.mock("../agents/tools/logNoteTool.js", () => ({
  logNote: logNoteMock,
}));

vi.mock("../agents/tools/eventLogTool.js", () => ({
  listEventsTool: listEventsMock,
  logEvent: logEventMock,
  rescheduleEventTool: rescheduleEventMock,
  updateEventStatus: updateEventMock,
}));

vi.mock("../agents/tools/youtubeTool.js", () => ({
  youtubeSearchTool: youtubeSearchMock,
  youtubeRecommendTool: vi.fn().mockResolvedValue("Recommendations ready."),
  youtubePlaylistTool: youtubePlaylistMock,
  youtubeBookmarkTool: youtubeBookmarkMock,
  youtubeCueTool: youtubeCueMock,
}));

vi.mock("../agents/tools/youtubeConnectTool.js", () => ({
  connectGoogleTool: vi.fn().mockResolvedValue("Google connect link."),
}));

vi.mock("../agents/tools/kiteConnectTool.js", () => ({
  connectKiteTool: connectKiteMock,
}));

vi.mock("../agents/tools/listTool.js", () => ({
  magnusListCatalog: vi.fn().mockResolvedValue("watchlist, readlist"),
  magnusListItems: listItemsMock,
  magnusAddListItem: addListItemMock,
  magnusRecommendListItems: recommendListMock,
  magnusCreateList: createListMock,
  magnusUpdateListItem: vi.fn().mockResolvedValue("Updated."),
  magnusLinkNotionList: vi.fn().mockResolvedValue("Linked."),
  list_catalog: vi.fn(),
  list_items: listItemsMock,
  add_list_item: addListItemMock,
  recommend_list_items: recommendListMock,
  create_list: createListMock,
  addGoal: addGoalMock,
  logDailyCheckin: logDailyCheckinMock,
  getDailyCheckin: vi.fn().mockResolvedValue("No check-in yet."),
  notionListItems: vi.fn(),
  notionAddItem: vi.fn(),
  notionUpdateItem: vi.fn(),
  addNotionGoal: vi.fn(),
}));

vi.mock("../lifeos/lifeosTool.js", () => ({
  lifeosListGoals: vi.fn().mockResolvedValue("Goals list."),
  lifeosLogJoyTank: logJoyTankMock,
  lifeosUpdatePillarStatus: updatePillarMock,
}));

vi.mock("../agents/tools/notionConnectTool.js", () => ({
  connectNotionTool: connectNotionMock,
  setupNotionTool: setupNotionMock,
  syncNotionTool: syncNotionMock,
}));

vi.mock("../proactive/manageProactiveTool.js", () => ({
  manageProactiveMessages: manageProactiveMock,
}));

vi.mock("../agents/routing/pillarStrategy/dayOverview.js", () => ({
  executeDayOverviewCapability: (...args: unknown[]) => dayOverviewMock(...args),
}));

vi.mock("../pillars/wealth/zerodha/index.js", () => ({
  fetchKitePortfolioSnapshot: vi.fn().mockResolvedValue({
    ok: false,
    error: "not_connected",
    meta: { kite: "not_connected" },
  }),
  formatKitePortfolioForPrompt: vi.fn().mockReturnValue(""),
}));

vi.mock("../agents/routing/pillarStrategy/executePillarConsultation.js", () => ({
  executePillarConsultationStep: vi.fn().mockResolvedValue({
    text: "Consultation composed.",
    metadata: { specialist: "Magnus", pillar_consultation: true },
  }),
}));

import { runOrchestratorReply } from "../agents/magnusOrchestrator.js";

const TURN = {
  userProfileId: "00000000-0000-0000-0000-000000000099",
  telegramUserId: "999001",
  timezone: "Asia/Kolkata",
  displayName: "Test User",
};

const goldenResults: Array<{
  query: string;
  category: string;
  passed: boolean;
  failures: string[];
}> = [];

describe("magnus golden path (100 user asks)", () => {
  beforeEach(() => {
    process.env.MAGNUS_PILLAR_PLAN_COMPOSE = "false";
    state.anthropicCalls = 0;
    createMock.mockReset();
    createMock.mockImplementation(async (params: {
      max_tokens?: number;
      system?: string;
      messages?: unknown;
      tools?: { name: string }[];
    }) => {
      state.anthropicCalls += 1;
      const scenario = state.scenario;
      if (!scenario) {
        return textReply("fallback");
      }

      if (params.max_tokens === 16) {
        return textReply(scenario.idealIntent);
      }

      const system = String(params.system ?? "");
      if (system.includes("ordered execution plan")) {
        return textReply(
          JSON.stringify({
            confidence: 0.92,
            steps: [{ capability: scenario.idealCapability, args: {} }],
          }),
        );
      }

      if (params.tools?.length && scenario.expectedPrimaryTool) {
        const allowed = params.tools.map((t) => t.name);
        const tool =
          allowed.includes(scenario.expectedPrimaryTool)
            ? scenario.expectedPrimaryTool
            : allowed[0];
        return toolReply(tool ?? "read_calendar", {});
      }

      return textReply("Magnus reply for the user.");
    });

    readCalendarMock.mockResolvedValue("- Tue 10:00 — Standup");
    createCalendarMock.mockResolvedValue("Created event.");
    updateCalendarMock.mockResolvedValue("Updated event.");
    deleteCalendarMock.mockResolvedValue("Deleted event.");
    logNoteMock.mockResolvedValue("Note logged.");
    listEventsMock.mockResolvedValue("No events.");
    logEventMock.mockResolvedValue("Event logged.");
    rescheduleEventMock.mockResolvedValue("Event rescheduled.");
    updateEventMock.mockResolvedValue("Event updated.");
    youtubeSearchMock.mockResolvedValue("YouTube results.");
    youtubePlaylistMock.mockResolvedValue("Playlist updated.");
    youtubeBookmarkMock.mockResolvedValue("Bookmarked.");
    youtubeCueMock.mockResolvedValue("Queued.");
    listItemsMock.mockResolvedValue("List items.");
    addListItemMock.mockResolvedValue('Added to list: "Item".');
    recommendListMock.mockResolvedValue("Pick from list: Film A.");
    createListMock.mockResolvedValue("List created.");
    logDailyCheckinMock.mockResolvedValue("Check-in logged.");
    logJoyTankMock.mockResolvedValue("Joy tank logged.");
    updatePillarMock.mockResolvedValue("Pillar status updated.");
    addGoalMock.mockResolvedValue("Goal added.");
    connectNotionMock.mockResolvedValue("Notion connect link.");
    syncNotionMock.mockResolvedValue("Notion synced.");
    setupNotionMock.mockResolvedValue("Notion setup done.");
    manageProactiveMock.mockResolvedValue("Reminder scheduled.");
    connectKiteMock.mockResolvedValue("Kite connect link.");
    dayOverviewMock.mockResolvedValue({
      text: "Day overview: calendar + meals.",
      metadata: { specialist: "Magnus", day_overview: true },
    });
    mealLogMock.mockResolvedValue({
      text: "Logged meal.",
      metadata: { specialist: "MealLog", meal_logged: true, tools_used: ["meal_log"] },
    });
    mealPhotoMock.mockResolvedValue({
      text: "Logged meal from photo.",
      metadata: { specialist: "MealLog", meal_logged: true },
    });
  });

  afterEach(() => {
    state.scenario = null;
  });

  it("runs exactly 100 golden scenarios", () => {
    expect(GOLDEN_PATH_SCENARIOS.length).toBe(100);
  });

  for (const scenario of GOLDEN_PATH_SCENARIOS) {
    const label = `${scenario.category}: ${scenario.query.slice(0, 48)}`;

    it(label, async () => {
      state.scenario = scenario;

      const out = await runOrchestratorReply({
        userMessage: scenario.query,
        ...TURN,
      });

      const result = assertGoldenPathOutcome(out, scenario);
      goldenResults.push({
        query: scenario.query,
        category: scenario.category,
        passed: result.passed,
        failures: result.failures,
      });

      expect(result.failures, scenario.query).toEqual([]);
    });
  }

  it("records golden path summary for docs", () => {
    const passed = goldenResults.filter((r) => r.passed).length;
    const failed = goldenResults.filter((r) => !r.passed);
    expect(passed + failed.length).toBe(100);
    expect(failed).toEqual([]);
  });
});
