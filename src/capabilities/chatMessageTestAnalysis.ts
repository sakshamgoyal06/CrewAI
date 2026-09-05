/**
 * Structural + flow analysis for the 1000-message chat test suite.
 */
import type { ChatIssueTag, ChatMessageTestCase } from "./chatMessageTestSuite.types.js";

export type StructuralCheckResult = {
  id: string;
  message: string;
  passed: boolean;
  failures: string[];
  warnings: string[];
};

export type SuiteAnalysisSummary = {
  total: number;
  structuralPass: number;
  structuralFail: number;
  withIssueTags: number;
  byIssueTag: Record<ChatIssueTag, number>;
  detectorCollisions: number;
  followUpWithoutPriorTurnFlag: number;
  catalogAligned: number;
};

const FOLLOW_UP_RE = /^(yes|no|undo|that's right|all set|go with \d|lock it in)\.?$/i;

export function analyzeStructuralCase(
  tc: ChatMessageTestCase,
  deps: {
    mealParse: (msg: string) => { kind: string };
  },
): StructuralCheckResult {
  const failures: string[] = [];
  const warnings: string[] = [];

  if (tc.structural?.explicitMealLog !== undefined) {
    const actual = deps.mealParse(tc.message).kind === "meal";
    if (tc.structural.explicitMealLog !== actual) {
      failures.push(`explicitMealLog: expected ${tc.structural.explicitMealLog}, got ${actual}`);
    }
  }

  if (FOLLOW_UP_RE.test(tc.message.trim()) && !tc.requiresPriorTurn) {
    warnings.push("follow-up message without requiresPriorTurn flag");
  }

  if (tc.issueTags?.includes("meal_log_tense") && deps.mealParse(tc.message).kind === "meal") {
    warnings.push("meal_log_tense tagged but parses as explicit meal");
  }

  return {
    id: tc.id,
    message: tc.message.slice(0, 80),
    passed: failures.length === 0,
    failures,
    warnings,
  };
}

export function summarizeSuiteAnalysis(
  cases: ChatMessageTestCase[],
  results: StructuralCheckResult[],
): SuiteAnalysisSummary {
  const byIssueTag = {} as Record<ChatIssueTag, number>;
  let withIssueTags = 0;
  let detectorCollisions = 0;
  let followUpWithoutPriorTurnFlag = 0;
  let catalogAligned = 0;

  for (const tc of cases) {
    if (tc.issueTags?.length) {
      withIssueTags++;
      for (const t of tc.issueTags) {
        byIssueTag[t] = (byIssueTag[t] ?? 0) + 1;
      }
    }
    if (tc.idealIntent && tc.idealCapability) catalogAligned++;
  }

  let structuralPass = 0;
  for (const r of results) {
    if (r.passed) structuralPass++;
    if (r.failures.some((f) => f.startsWith("collision"))) detectorCollisions++;
    if (r.warnings.some((w) => w.includes("requiresPriorTurn"))) followUpWithoutPriorTurnFlag++;
  }

  return {
    total: cases.length,
    structuralPass,
    structuralFail: results.length - structuralPass,
    withIssueTags,
    byIssueTag,
    detectorCollisions,
    followUpWithoutPriorTurnFlag,
    catalogAligned,
  };
}

/** Known production failure patterns from real chat review */
export const PRODUCTION_ISSUE_FINDINGS = [
  {
    id: "PI-001",
    severity: "high",
    title: "Present-tense meal logging rejected",
    examples: [
      "For breakfast today, I am having 2 besan cheelas",
      "I am eating a dahi aloo tikki from bistro",
    ],
    rootCause: "Meal gate requires past-tense or explicit meal: prefix; present tense triggers confirm loop or rejection",
    improvement: "Treat 'I am having/eating X' as log intent with optional confirm only for ambiguous cases",
  },
  {
    id: "PI-002",
    severity: "high",
    title: "Duplicate meal log on single utterance",
    examples: ["I had 2 paratha, bhindi sabji, and boondi raita for lunch"],
    rootCause: "Meal pipeline may double-compose or re-run log in accountability pass",
    improvement: "Idempotency key per turn; single meal_log write per user message",
  },
  {
    id: "PI-003",
    severity: "high",
    title: "Duplicate meal entries (burrito bowl twice)",
    examples: ["You logged burrito bowl twice, i only ate one"],
    rootCause: "No dedupe on semantically identical meals within short window",
    improvement: "Fuzzy dedupe before insert; surface 'looks like duplicate' prompt",
  },
  {
    id: "PI-004",
    severity: "medium",
    title: "Meal slot / breakdown confusion",
    examples: [
      "Samosa and tea was in evening and not mid morning",
      "Why did you change breakfast and dinner?",
    ],
    rootCause: "Meal breakdown groups by inference not user-stated meal times",
    improvement: "Store meal_slot on log; honor corrections without re-inferring slots",
  },
  {
    id: "PI-005",
    severity: "medium",
    title: "Playlist name ambiguity (Magnus vs YT Music)",
    examples: [
      "Add 5 famous rock songs in my high energy workout playlist in youtube music",
    ],
    rootCause: "Multiple playlist namespaces; fuzzy name match picks wrong target",
    improvement: "Resolve playlist by source (YT Music vs Magnus) before write; confirm on ambiguity",
  },
  {
    id: "PI-006",
    severity: "medium",
    title: "Undo / follow-up requires disambiguation",
    examples: ["Undo this.", "Yes"],
    rootCause: "No durable 'last actionable turn' pointer for undo scope",
    improvement: "Track reversible actions in turn metadata; default undo to most recent write",
  },
  {
    id: "PI-007",
    severity: "medium",
    title: "Watchlist timestamp unavailable",
    examples: ["When did i add ship of theseus to watchlist"],
    rootCause: "List items lack created_at in user-facing catalog read",
    improvement: "Expose added_at from list_items or chat action ledger",
  },
  {
    id: "PI-008",
    severity: "medium",
    title: "Treadmill watch routed to Happiness not playlist tool",
    examples: ["What should i watch for treadmill tomorrow"],
    rootCause: "Classifier picks taste recommendation pillar over saved-list cue",
    improvement: "Routing hint: treadmill + watch → youtube/list recommend from saved",
  },
  {
    id: "PI-009",
    severity: "medium",
    title: "Calendar not read when user insists",
    examples: ["Cant you check using calendar connections?", "You are not looking at calendar"],
    rootCause: "GENERAL plan may answer from memory without calling read_calendar",
    improvement: "Force calendar tool when user challenges calendar accuracy",
  },
  {
    id: "PI-010",
    severity: "low",
    title: "Partial YouTube save failures",
    examples: ["Add while my guitar gently weeps... (Note: one or more save steps failed)"],
    rootCause: "Multi-step playlist writes lack transactional rollback",
    improvement: "All-or-nothing batch; report which step failed with retry",
  },
  {
    id: "PI-011",
    severity: "medium",
    title: "Meal plan vs day overview ambiguity",
    examples: [
      "Whats the plan for tomorrow?",
      "I mean, what does my whole day look like tomorrow",
    ],
    rootCause: "'plan for tomorrow' spans meal plan, gym, calendar without disambiguation",
    improvement: "Clarify or default to day_overview when calendar/events context exists",
  },
  {
    id: "PI-012",
    severity: "low",
    title: "Multi-intent messages partially handled",
    examples: [
      "Add this to my calendar. And suggest the youtube video for treadmill",
      "Whats the gym plan for today. And meal plan for today",
    ],
    rootCause: "Plan parser may execute first step only",
    improvement: "pillar_consultation or multi-step GENERAL plans for compound asks",
  },
] as const;
