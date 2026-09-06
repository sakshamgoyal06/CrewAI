/**
 * Magnus accuracy suite — CI scoreboard for routing, tools, integrity, minimal gates.
 *
 * Inspired by BFCL (tool selection), τ-bench (task routing), ReliabilityBench (metamorphic + fault).
 * Fixture-driven orchestrator runs — proves wiring; live eval is Step 8 in MAGNUS_ACCURACY_PLAN.md.
 *
 * Run: npm run test:accuracy
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildAccuracyReport,
  evaluateActionIntegrityCase,
  evaluateOrchestratorCase,
  evaluateReadBeforeWriteCase,
  formatAccuracyReportMarkdown,
} from "./magnusAccuracyEvaluators.js";
import {
  buildAnthropicMockHandler,
} from "./magnusAccuracyOrchestratorHarness.js";
import {
  ACTION_INTEGRITY_ACCURACY_CASES,
  ALL_MINIMAL_ORCHESTRATOR_CASES,
  FAULT_TOLERANCE_CASES,
  METAMORPHIC_PARAPHRASE_GROUPS,
  READ_BEFORE_WRITE_CASES,
  toGoldenPathScenario,
} from "./magnusAccuracyScenarios.js";
import type { MagnusAccuracyCaseResult } from "./magnusAccuracySuite.types.js";
import { DEFAULT_ACCURACY_GATES } from "./magnusAccuracySuite.types.js";
import { classifyToolResult } from "../agents/routing/actionIntegrity.js";

const TURN = {
  userProfileId: "00000000-0000-0000-0000-000000000099",
  telegramUserId: "999001",
  timezone: "Asia/Kolkata",
  displayName: "Test User",
};

const suiteResults: MagnusAccuracyCaseResult[] = [];

const accuracyState = vi.hoisted(() => ({
  scenario: null as import("./goldenPathScenarios.js").GoldenPathScenario | null,
  anthropicCalls: 0,
}));

const accuracyCreateMock = vi.hoisted(() => vi.fn());

vi.mock("../tools/clients.js", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../tools/clients.js")>();
  return {
    ...mod,
    anthropic: {
      ...mod.anthropic,
      messages: { create: accuracyCreateMock },
    },
    redis: {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue("OK"),
      del: vi.fn().mockResolvedValue(1),
    },
  };
});

vi.mock("../agents/memory/memoryAgent.js", () => ({
  loadMemoryContext: vi.fn().mockResolvedValue({
    purpose: "chat",
    loadedAt: new Date().toISOString(),
    profile: null,
    recentSignals: { recentChatTurns: [] },
    rollingSummaries: {},
    activeGoals: [],
    joy: {},
    patterns: [],
    gaps: [],
  }),
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

vi.mock("../agents/health/healthOnboarding.js", () => ({
  fetchUserHealthProfile: vi.fn().mockResolvedValue({
    onboarding_completed_at: "2026-01-01T00:00:00Z",
  }),
  formatHealthPreferencesForPrompt: vi.fn().mockReturnValue(""),
  runHealthOnboardingTurn: vi.fn(),
  startHealthOnboarding: vi.fn(),
}));

vi.mock("../tools/routingContext.js", () => ({
  fetchRecentRoutingTurns: vi.fn().mockResolvedValue([]),
}));

vi.mock("../projects/projectSessionPrelude.js", () => ({
  tryResolveActiveProjectSessionTurn: vi.fn().mockResolvedValue({ handled: false }),
}));

vi.mock("../agents/routing/pillarStrategy/buildRoutingHints.js", () => ({
  buildRoutingHints: vi.fn().mockResolvedValue({}),
}));

vi.mock("../pillars/health/references/loadHealthReferences.js", () => ({
  loadHealthReferenceBlock: vi.fn().mockResolvedValue({ block: "", gaps: [] }),
}));

vi.mock("../agents/health/nutritionOrchestrated.js", () => ({
  runOrchestratedMealLogTurn: vi.fn(),
  runMealPhotoLogTurn: vi.fn(),
}));

vi.mock("../agents/health/mealHistoryAgent.js", () => ({
  executeMealHistoryCapability: vi.fn(),
}));

vi.mock("../agents/health/mealTargetAgent.js", () => ({
  executeMealTargetCapability: vi.fn(),
}));

vi.mock("../agents/health/mealPlanningAgent.js", () => ({
  executeMealPlanningCapability: vi.fn(),
}));

vi.mock("../agents/health/mealPlanReadAgent.js", () => ({
  executeMealPlanReadCapability: vi.fn(),
}));

vi.mock("../agents/health/healthJournalAgent.js", () => ({
  runHealthJournalAgent: vi.fn(),
}));

vi.mock("../pillars/health/workouts/agents/hevyWriteAgent.js", () => ({
  tryHevyWriteAgent: vi.fn().mockResolvedValue(null),
}));

vi.mock("../pillars/health/workouts/agents/fitnessAgent.js", () => ({
  runFitnessCapability: vi.fn().mockResolvedValue({
    text: "Fitness coaching reply.",
    metadata: { specialist: "Fitness" },
  }),
}));

vi.mock("../agents/tools/calendarTool.js", () => ({
  readCalendarEvents: vi.fn().mockResolvedValue("- Tue 10:00 — Standup"),
  createCalendarEvent: vi.fn().mockResolvedValue("Created event."),
  updateCalendarEvent: vi.fn().mockResolvedValue("Updated event."),
  deleteCalendarEvent: vi.fn().mockResolvedValue("Deleted event."),
}));

vi.mock("../agents/tools/logNoteTool.js", () => ({
  logNote: vi.fn().mockResolvedValue("Note logged."),
}));

vi.mock("../agents/tools/eventLogTool.js", () => ({
  listEventsTool: vi.fn().mockResolvedValue("No events."),
  logEvent: vi.fn().mockResolvedValue("Event logged."),
  rescheduleEventTool: vi.fn().mockResolvedValue("Event rescheduled."),
  updateEventStatus: vi.fn().mockResolvedValue("Event updated."),
}));

vi.mock("../agents/tools/youtubeTool.js", () => ({
  youtubeSearchTool: vi.fn().mockResolvedValue("YouTube results."),
  youtubeRecommendTool: vi.fn().mockResolvedValue("Recommendations ready."),
  youtubePlaylistTool: vi.fn().mockResolvedValue("Playlist updated."),
  youtubeBookmarkTool: vi.fn().mockResolvedValue("Bookmarked."),
  youtubeCueTool: vi.fn().mockResolvedValue("Queued."),
}));

vi.mock("../agents/tools/listTool.js", () => ({
  magnusListCatalog: vi.fn().mockResolvedValue("watchlist, readlist"),
  magnusListItems: vi.fn().mockResolvedValue("List items."),
  magnusAddListItem: vi.fn().mockResolvedValue('Added to list: "Item".'),
  magnusRecommendListItems: vi.fn().mockResolvedValue("Pick from list."),
  magnusCreateList: vi.fn().mockResolvedValue("List created."),
  list_items: vi.fn(),
  add_list_item: vi.fn(),
}));

vi.mock("../proactive/manageRemindersTool.js", () => ({
  manageReminders: vi.fn().mockResolvedValue("Reminder scheduled."),
}));

vi.mock("../agents/routing/pillarStrategy/dayOverview.js", () => ({
  executeDayOverviewCapability: vi.fn().mockResolvedValue({
    text: "Day overview.",
    metadata: { specialist: "Magnus", day_overview: true },
  }),
}));

vi.mock("../agents/context/assembleRoutingContext.js", () => ({
  assembleRoutingContext: vi.fn().mockResolvedValue({
    userProfileId: "00000000-0000-0000-0000-000000000099",
    assembledAt: new Date().toISOString(),
    identity: { timezone: "Asia/Kolkata", northStarGoal: "", healthOnboardingComplete: true },
    integrations: {
      googleCalendar: "connected",
      youtube: "connected",
      notion: "not_connected",
      hevy: "not_connected",
      zerodha: "not_connected",
    },
    recentTurns: [],
    pending: {},
    activeWork: { activeProjects: [], openCommitmentCount: 0, overdueCommitmentCount: 0 },
    standing: { programNotes: [], routingFacts: [] },
    growth: {
      localTime: { dateKey: "2026-09-05", hour: 12, minute: 0, isLateEvening: false },
      dayFrame: { tone: "neutral", morningNotes: [] },
      northStar: { goals: [] },
      operations: { todayCommitments: [], overdueCount: 0, errands: [], slippingRoutines: [] },
      projects: { active: [] },
      lists: [],
      listHighlights: [],
      behavior: { issues: [], wins: [], dailyLogSnippets: [], narrativeBullets: [] },
      kpis: { pillarStatus: [], topRoutines: [] },
    },
    routingHints: {},
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
  }),
}));

vi.mock("../agents/routing/pillarStrategy/executePillarConsultation.js", () => ({
  executePillarConsultationStep: vi.fn().mockResolvedValue({
    text: "Consultation composed.",
    metadata: { specialist: "Magnus", pillar_consultation: true },
  }),
}));

import { runOrchestratorReply } from "../agents/magnusOrchestrator.js";

describe("magnus accuracy suite", () => {
  beforeEach(() => {
    process.env.MAGNUS_MINIMAL_MODE = "true";
    process.env.MAGNUS_PILLAR_PLAN_COMPOSE = "false";
    process.env.NODE_ENV = "test";
    accuracyState.anthropicCalls = 0;
    accuracyState.scenario = null;
    accuracyCreateMock.mockReset();
    accuracyCreateMock.mockImplementation(buildAnthropicMockHandler(accuracyState));
  });

  afterEach(() => {
    accuracyState.scenario = null;
  });

  describe("action integrity (Tool-Veritas state-based)", () => {
    for (const c of ACTION_INTEGRITY_ACCURACY_CASES) {
      it(c.id, () => {
        const result = evaluateActionIntegrityCase(c);
        suiteResults.push(result);
        expect(result.failures, c.id).toEqual([]);
      });
    }
  });

  describe("fault tolerance (ReliabilityBench λ)", () => {
    for (const c of FAULT_TOLERANCE_CASES) {
      it(c.id, () => {
        const ok = classifyToolResult(c.toolOutput);
        const failures: string[] = [];
        if (ok !== c.ok) {
          failures.push(`classifyToolResult: expected ${c.ok}, got ${ok}`);
        }
        suiteResults.push({
          id: c.id,
          dimension: "fault_tolerance",
          passed: failures.length === 0,
          failures,
        });
        expect(failures).toEqual([]);
      });
    }
  });

  describe("read-before-write guards (Step 5)", () => {
    for (const c of READ_BEFORE_WRITE_CASES) {
      it(c.id, () => {
        const result = evaluateReadBeforeWriteCase(c);
        suiteResults.push(result);
        expect(result.failures, c.id).toEqual([]);
      });
    }
  });

  describe("metamorphic paraphrase groups (ReliabilityBench ε)", () => {
    for (const group of METAMORPHIC_PARAPHRASE_GROUPS) {
      it(`${group.id} has coherent expectations`, () => {
        expect(group.paraphrases.length).toBeGreaterThanOrEqual(4);
        expect(group.idealIntent).toBeTruthy();
        expect(group.idealCapability).toBeTruthy();
        suiteResults.push({
          id: group.id,
          dimension: "metamorphic_design",
          passed: true,
          failures: [],
        });
      });

      for (const phrase of group.paraphrases) {
        it(`${group.id}: ${phrase.slice(0, 40)}`, async () => {
          const scenario = {
            query: phrase,
            idealIntent: group.idealIntent,
            idealCapability: group.idealCapability,
            category: group.category,
            hints: {},
            expectedPrimaryTool: group.expectedPrimaryTool,
          };
          accuracyState.scenario = scenario;

          const out = await runOrchestratorReply({
            userMessage: phrase,
            ...TURN,
          });

          const result = evaluateOrchestratorCase(out, {
            id: `${group.id}:${phrase.slice(0, 16)}`,
            dimension: "metamorphic_design",
            message: phrase,
            category: group.category,
            idealIntent: group.idealIntent,
            idealCapability: group.idealCapability,
            expectedPrimaryTool: group.expectedPrimaryTool,
          });
          suiteResults.push(result);
          expect(result.failures, phrase).toEqual([]);
        });
      }
    }
  });

  describe("minimal-mode orchestrator (routing + tool_selection + minimal_gate)", () => {
    it("has a non-trivial minimal case set", () => {
      expect(ALL_MINIMAL_ORCHESTRATOR_CASES.length).toBeGreaterThanOrEqual(20);
    });

    for (const scenario of ALL_MINIMAL_ORCHESTRATOR_CASES) {
      it(`${scenario.id}: ${scenario.message.slice(0, 48)}`, async () => {
        accuracyState.scenario = toGoldenPathScenario(scenario);

        const out = await runOrchestratorReply({
          userMessage: scenario.message,
          ...TURN,
        });

        const result = evaluateOrchestratorCase(out, scenario);
        suiteResults.push(result);
        expect(result.failures, scenario.message).toEqual([]);
      });
    }
  });

  describe("accuracy gates", () => {
    it("meets CI thresholds for minimal-mode fixture suite", () => {
      const report = buildAccuracyReport({
        results: suiteResults,
        gates: DEFAULT_ACCURACY_GATES,
      });

      // Emit scorecard for CI logs
      const markdown = formatAccuracyReportMarkdown(report);
      // eslint-disable-next-line no-console
      console.log("\n" + markdown);

      expect(report.metrics.actionIntegrity).toBeGreaterThanOrEqual(
        DEFAULT_ACCURACY_GATES.actionIntegrity,
      );
      expect(report.metrics.voiceCoherence).toBeGreaterThanOrEqual(
        DEFAULT_ACCURACY_GATES.voiceCoherence,
      );
      expect(report.metrics.minimalGate).toBeGreaterThanOrEqual(
        DEFAULT_ACCURACY_GATES.minimalGate,
      );
      expect(report.metrics.faultHonesty).toBeGreaterThanOrEqual(
        DEFAULT_ACCURACY_GATES.faultHonesty,
      );
      expect(report.metrics.routingAt1).toBeGreaterThanOrEqual(
        DEFAULT_ACCURACY_GATES.routingAt1,
      );
      expect(report.metrics.toolSelectAt1).toBeGreaterThanOrEqual(
        DEFAULT_ACCURACY_GATES.toolSelectAt1,
      );
      expect(report.metrics.metamorphicDesign).toBeGreaterThanOrEqual(
        DEFAULT_ACCURACY_GATES.metamorphicDesign,
      );
      expect(report.metrics.metamorphicPass).toBeGreaterThanOrEqual(
        DEFAULT_ACCURACY_GATES.metamorphicPass,
      );
      expect(report.metrics.readBeforeWrite).toBeGreaterThanOrEqual(
        DEFAULT_ACCURACY_GATES.readBeforeWrite,
      );
      expect(report.allGatesPassed).toBe(true);
    });
  });
});
