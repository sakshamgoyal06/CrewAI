/**
 * Curated accuracy scenarios — minimal-mode first, philosophy & tool usage.
 * Complements goldenPathScenarios (100 catalog) with explicit dimension tags.
 */
import type { Intent } from "../intent.js";
import {
  primaryToolForGeneralCapability,
  type GoldenPathScenario,
} from "./goldenPathScenarios.js";
import { USER_QUERY_CATALOG } from "./userQueryCatalog.js";
import type {
  MagnusAccuracyOrchestratorCase,
  MagnusMetamorphicGroup,
} from "./magnusAccuracySuite.types.js";

/** Minimal-mode live GENERAL capabilities */
export const MINIMAL_GENERAL_CAPABILITIES = new Set([
  "calendar",
  "event_log",
  "reminders",
  "day_overview",
  "youtube",
  "lists",
  "conversation",
  "pillar_consultation",
]);

/** Minimal-mode HEALTH capabilities */
export const MINIMAL_HEALTH_CAPABILITIES = new Set(["fitness", "hevy_write", "generic_ack"]);

function orchestratorCase(input: {
  id: string;
  dimension: MagnusAccuracyOrchestratorCase["dimension"];
  message: string;
  category: string;
  idealIntent: Intent;
  idealCapability: string;
  expectedPrimaryTool?: string;
  expectedDelegatedAgent?: string;
  replyContains?: string;
  replyExcludes?: string;
}): MagnusAccuracyOrchestratorCase {
  return { ...input, minimalModeOnly: true };
}

/** Explicit minimal-mode orchestrator cases (parked gates, reminders, continuations). */
export const MINIMAL_ACCURACY_ORCHESTRATOR_CASES: MagnusAccuracyOrchestratorCase[] = [
  orchestratorCase({
    id: "min-cal-read-1",
    dimension: "routing",
    message: "what's on my calendar tomorrow?",
    category: "general_calendar",
    idealIntent: "GENERAL",
    idealCapability: "calendar",
    expectedPrimaryTool: "read_calendar",
  }),
  orchestratorCase({
    id: "min-cal-create-1",
    dimension: "tool_selection",
    message: "book dentist Friday 3pm",
    category: "general_calendar",
    idealIntent: "GENERAL",
    idealCapability: "calendar",
    expectedPrimaryTool: "create_calendar_event",
  }),
  orchestratorCase({
    id: "min-event-log-1",
    dimension: "tool_selection",
    message: "log gym tomorrow 7am",
    category: "general_event_log",
    idealIntent: "GENERAL",
    idealCapability: "event_log",
    expectedPrimaryTool: "log_event",
  }),
  orchestratorCase({
    id: "min-reminder-1",
    dimension: "tool_selection",
    message: "remind me to call mom tomorrow at 6pm",
    category: "general_reminders",
    idealIntent: "GENERAL",
    idealCapability: "reminders",
    expectedPrimaryTool: "manage_reminders",
  }),
  orchestratorCase({
    id: "min-list-read-1",
    dimension: "routing",
    message: "what's on my watchlist?",
    category: "general_lists",
    idealIntent: "GENERAL",
    idealCapability: "lists",
    expectedPrimaryTool: "list_items",
  }),
  orchestratorCase({
    id: "min-list-add-1",
    dimension: "tool_selection",
    message: "add Dune to watchlist",
    category: "general_lists",
    idealIntent: "GENERAL",
    idealCapability: "lists",
    expectedPrimaryTool: "add_list_item",
  }),
  orchestratorCase({
    id: "min-yt-search-1",
    dimension: "routing",
    message: "search youtube for lo-fi focus music",
    category: "general_youtube",
    idealIntent: "GENERAL",
    idealCapability: "youtube",
    expectedPrimaryTool: "youtube_search",
  }),
  orchestratorCase({
    id: "min-yt-playlist-1",
    dimension: "tool_selection",
    message: "add this to my wisdom playlist",
    category: "general_youtube",
    idealIntent: "GENERAL",
    idealCapability: "youtube",
    expectedPrimaryTool: "youtube_playlist",
  }),
  orchestratorCase({
    id: "min-day-overview-1",
    dimension: "routing",
    message: "what does tomorrow look like?",
    category: "general_day",
    idealIntent: "GENERAL",
    idealCapability: "day_overview",
  }),
  orchestratorCase({
    id: "min-health-fitness-1",
    dimension: "routing",
    message: "should I train legs today?",
    category: "health_fitness",
    idealIntent: "HEALTH",
    idealCapability: "fitness",
    expectedDelegatedAgent: "HealthComposite",
  }),
  orchestratorCase({
    id: "min-park-meal-1",
    dimension: "minimal_gate",
    message: "I'm having chicken rice for lunch",
    category: "parked_meals",
    idealIntent: "GENERAL",
    idealCapability: "conversation",
    replyContains: "temporarily parked",
    replyExcludes: "logged",
  }),
  orchestratorCase({
    id: "min-park-wealth-1",
    dimension: "minimal_gate",
    message: "show my zerodha portfolio",
    category: "parked_wealth",
    idealIntent: "GENERAL",
    idealCapability: "conversation",
    replyContains: "temporarily parked",
  }),
  orchestratorCase({
    id: "min-park-notion-1",
    dimension: "minimal_gate",
    message: "connect notion",
    category: "parked_notion",
    idealIntent: "GENERAL",
    idealCapability: "conversation",
    replyContains: "temporarily parked",
  }),
  orchestratorCase({
    id: "min-park-happiness-1",
    dimension: "minimal_gate",
    message: "recommend a movie for tonight",
    category: "parked_happiness",
    idealIntent: "GENERAL",
    idealCapability: "conversation",
    replyContains: "temporarily parked",
  }),
];

/** Metamorphic paraphrase groups — design-time routing expectations (ReliabilityBench ε). */
export const METAMORPHIC_PARAPHRASE_GROUPS: MagnusMetamorphicGroup[] = [
  {
    id: "morph-calendar-read",
    category: "general_calendar",
    paraphrases: [
      "what's on my calendar tomorrow?",
      "show me tomorrow's schedule",
      "anything on the calendar for Friday?",
      "do I have meetings tomorrow morning?",
    ],
    idealIntent: "GENERAL",
    idealCapability: "calendar",
    expectedPrimaryTool: "read_calendar",
  },
  {
    id: "morph-gym-log",
    category: "general_event_log",
    paraphrases: [
      "log gym tomorrow 7am",
      "schedule gym 7 tomorrow morning",
      "plan gym session tomorrow at 7",
      "commit to gym tomorrow 7am",
    ],
    idealIntent: "GENERAL",
    idealCapability: "event_log",
    expectedPrimaryTool: "log_event",
  },
  {
    id: "morph-watchlist",
    category: "general_lists",
    paraphrases: [
      "what's on my watchlist?",
      "show watchlist items",
      "list my watchlist",
      "what movies am I saving to watch?",
    ],
    idealIntent: "GENERAL",
    idealCapability: "lists",
    expectedPrimaryTool: "list_items",
  },
  {
    id: "morph-holistic-day",
    category: "general_day",
    paraphrases: [
      "what does tomorrow look like?",
      "give me tomorrow at a glance",
      "holistic view of my day tomorrow",
      "tomorrow overview please",
    ],
    idealIntent: "GENERAL",
    idealCapability: "day_overview",
  },
  {
    id: "morph-fitness",
    category: "health_fitness",
    paraphrases: [
      "should I train legs today?",
      "is it a good day for leg day?",
      "review my workout plan for today",
      "what does Hevy say about my last session?",
    ],
    idealIntent: "HEALTH",
    idealCapability: "fitness",
  },
  {
    id: "morph-reminders",
    category: "general_reminders",
    paraphrases: [
      "remind me to call mom tomorrow at 6pm",
      "set a reminder for gym at 7am tomorrow",
      "nudge me at 9pm to review the deck",
      "ping me tomorrow morning to send the email",
    ],
    idealIntent: "GENERAL",
    idealCapability: "reminders",
    expectedPrimaryTool: "manage_reminders",
  },
  {
    id: "morph-youtube",
    category: "general_youtube",
    paraphrases: [
      "search YouTube for lo-fi study beats",
      "find a jazz playlist on YouTube",
      "look up a focus music video on youtube",
      "youtube search ambient coding music",
    ],
    idealIntent: "GENERAL",
    idealCapability: "youtube",
    expectedPrimaryTool: "youtube_search",
  },
];

export type ReadBeforeWriteCase = {
  id: string;
  writeTool: string;
  priorReads: string[];
  expectBlocked: boolean;
};

/** Step 5 — read-before-write guard matrix (pure, no I/O). */
export const READ_BEFORE_WRITE_CASES: ReadBeforeWriteCase[] = [
  {
    id: "rbw-cal-update-block",
    writeTool: "update_calendar_event",
    priorReads: [],
    expectBlocked: true,
  },
  {
    id: "rbw-cal-delete-block",
    writeTool: "delete_calendar_event",
    priorReads: [],
    expectBlocked: true,
  },
  {
    id: "rbw-cal-update-allow",
    writeTool: "update_calendar_event",
    priorReads: ["read_calendar"],
    expectBlocked: false,
  },
  {
    id: "rbw-cal-delete-allow-spill",
    writeTool: "delete_calendar_event",
    priorReads: ["read_calendar", "read_tool_artifact"],
    expectBlocked: false,
  },
  {
    id: "rbw-cal-create-allow",
    writeTool: "create_calendar_event",
    priorReads: [],
    expectBlocked: false,
  },
  {
    id: "rbw-list-update-block",
    writeTool: "update_list_item",
    priorReads: [],
    expectBlocked: true,
  },
  {
    id: "rbw-list-update-allow",
    writeTool: "update_list_item",
    priorReads: ["list_items"],
    expectBlocked: false,
  },
  {
    id: "rbw-list-add-allow",
    writeTool: "add_list_item",
    priorReads: [],
    expectBlocked: false,
  },
];

/** Build orchestrator cases from catalog entries compatible with minimal mode. */
export function buildMinimalCatalogOrchestratorCases(): MagnusAccuracyOrchestratorCase[] {
  return USER_QUERY_CATALOG.filter((entry) => {
    if (entry.idealIntent === "WEALTH" || entry.idealIntent === "HAPPINESS" || entry.idealIntent === "WISDOM") {
      return false;
    }
    if (entry.idealIntent === "HEALTH") {
      return MINIMAL_HEALTH_CAPABILITIES.has(entry.idealCapability);
    }
    if (entry.idealIntent === "GENERAL") {
      return MINIMAL_GENERAL_CAPABILITIES.has(entry.idealCapability);
    }
    return false;
  }).map((entry) =>
    orchestratorCase({
      id: `cat-${entry.category}-${entry.query.slice(0, 24).replace(/\W+/g, "-")}`,
      dimension: entry.idealIntent === "GENERAL" && entry.magnusTools ? "tool_selection" : "routing",
      message: entry.query,
      category: entry.category,
      idealIntent: entry.idealIntent,
      idealCapability: entry.idealCapability,
      expectedDelegatedAgent:
        entry.idealIntent === "HEALTH" ? "HealthComposite" : undefined,
      expectedPrimaryTool:
        entry.idealIntent === "GENERAL" && entry.magnusTools
          ? primaryToolForGeneralCapability(entry.idealCapability, entry.query)
          : undefined,
    }),
  );
}

export const ALL_MINIMAL_ORCHESTRATOR_CASES: MagnusAccuracyOrchestratorCase[] = [
  ...MINIMAL_ACCURACY_ORCHESTRATOR_CASES,
  ...buildMinimalCatalogOrchestratorCases(),
];

/** Convert accuracy case to golden-path scenario for shared fixture runner. */
export function toGoldenPathScenario(c: MagnusAccuracyOrchestratorCase): GoldenPathScenario {
  return {
    query: c.message,
    idealIntent: c.idealIntent,
    idealCapability: c.idealCapability,
    category: c.category,
    hints: {},
    expectedDelegatedAgent: c.expectedDelegatedAgent,
    expectedPrimaryTool: c.expectedPrimaryTool,
  };
}

/** Action integrity cases — Tool-Veritas style state-based checks. */
export const ACTION_INTEGRITY_ACCURACY_CASES = [
  {
    id: "ai-false-save-no-tools",
    text: "Added Dune to your watchlist.",
    metadata: { specialist: "Magnus", pillar: "magnus" },
    shouldCorrect: true,
    reason: "no_write_evidence",
  },
  {
    id: "ai-true-save-with-tool",
    text: "Done — **Dune** is on your watchlist.",
    metadata: {
      tools_used: ["add_list_item"],
      tool_outcomes: [{ name: "add_list_item", ok: true, preview: "Added" }],
    },
    shouldCorrect: false,
  },
  {
    id: "ai-calendar-without-sync",
    text: "Done! Calendar event is live for Friday.",
    metadata: { tools_used: ["log_event"] },
    shouldCorrect: true,
    reason: "calendar_claim_without_sync",
  },
  {
    id: "ai-prompt-only-specialist",
    text: "I've logged your workout in the check-in.",
    metadata: { prompt_only: true, specialist: "Fitness" },
    shouldCorrect: true,
    reason: "prompt_only_claim",
  },
  {
    id: "ai-fault-partial-write",
    text: "Added to watchlist and synced.",
    metadata: {
      tools_used: ["add_list_item", "add_list_item"],
      tool_outcomes: [
        { name: "add_list_item", ok: true, preview: "Added" },
        { name: "add_list_item", ok: false, preview: "Could not save" },
      ],
    },
    shouldCorrect: true,
    reason: "partial_write_failure",
  },
] as const;

/** Fault tolerance — tool failure must not produce success claims (ReliabilityBench λ). */
export const FAULT_TOLERANCE_CASES = [
  {
    id: "fault-list-add-fail",
    toolOutput: "Could not save to watchlist: db error",
    ok: false,
    forbiddenReplyPatterns: [/\badded\b/i, /\bsaved\b/i, /\bdone\b/i],
  },
  {
    id: "fault-calendar-read-fail",
    toolOutput: "Tool error: Google Calendar not connected",
    ok: false,
    forbiddenReplyPatterns: [/\bon your calendar\b/i, /\bscheduled\b/i],
  },
] as const;
