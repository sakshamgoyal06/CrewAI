/**
 * Frontload routing context — assembled once per turn before intent classification.
 * Scoped strictly by user_profile_id (multi-tenant safe).
 */
import type { IntentRoutingHints } from "../routing/intentRoutingHints.js";
import type { RoutingContextSignals } from "../routing/routingContextParser.js";
import type { UserKnowledgeIntegrations } from "../memory/userKnowledge.js";
import type { DayTone } from "./growthHelpers.js";

/** Compact turn for routing — includes metadata for continuations (Yes, undo, playlists). */
export type RoutingRecentTurn = {
  role: "user" | "assistant";
  content: string;
  intent?: string | null;
  delegatedAgent?: string | null;
  toolsUsed?: string[];
};

export type RoutingPendingState = {
  mealLogConfirm?: {
    preview: string;
    mealSlot?: string;
  };
  reversibleUndo?: {
    kind: string;
    summary: string;
  };
  projectSession?: {
    theme: string;
    step: string;
    status: string;
  };
  mealPlanSession?: {
    step: string;
    status: string;
    horizon?: string;
  };
};

export type RoutingActiveWork = {
  activeProjects: Array<{
    title: string;
    pillar: string;
    projectType?: string;
    status: string;
  }>;
  openCommitmentCount: number;
  overdueCommitmentCount: number;
};

/** Standing rules and preferences surfaced for routing (meal rules, avoid lists). */
export type RoutingStandingContext = {
  /** Short bullets from program_learnings / restrictions — max ~6 lines. */
  programNotes: string[];
  /** Semantic facts most relevant to routing disambiguation. */
  routingFacts: string[];
};

/** Growth-aligned snapshot — commitments, projects, north star, day frame, KPIs. */
export type RoutingGrowthContext = {
  localTime: {
    dateKey: string;
    hour: number;
    minute: number;
    isLateEvening: boolean;
  };

  /** Rest vs working day, morning state, today's win. */
  dayFrame: {
    tone: DayTone;
    toneReason?: string;
    morningIntention?: string;
    energyLevel?: number;
    feeling?: string;
    dayRating?: string;
    weekPriorities?: string;
    dailyPlanIntention?: string;
    morningNotes: string[];
    winConditionPending?: { phase: string; candidateText?: string };
  };

  northStar: {
    statement?: string;
    goals: Array<{
      title: string;
      pillar: string;
      timeframe: string;
      status: string;
    }>;
  };

  operations: {
    todayCommitments: Array<{
      title: string;
      status: string;
      pillar: string;
      activityKey?: string | null;
      plannedStartAt?: string | null;
      overdue?: boolean;
    }>;
    overdueCount: number;
    errands: Array<{
      source: "task" | "list" | "event";
      slug?: string;
      title: string;
      status?: string;
    }>;
    slippingRoutines: Array<{
      activityKey: string;
      activity: string;
      pillar?: string;
      recentMisses: number;
      showUpRate?: number;
      total?: number;
    }>;
  };

  projects: {
    active: Array<{
      title: string;
      pillar: string;
      status: string;
      projectType?: string;
      targetDate?: string | null;
      openChecklistCount?: number;
      nextChecklistItem?: string;
    }>;
    consistencyHint?: string;
  };

  lists: Array<{ slug: string; displayName: string; openCount: number }>;
  listHighlights: Array<{ slug: string; title: string; status?: string }>;

  behavior: {
    issues: string[];
    wins: string[];
    dailyLogSnippets: Array<{ date: string; snippet: string }>;
    narrativeBullets: string[];
  };

  kpis: {
    joyTank?: { level: number; date: string };
    pillarStatus: Array<{ pillar: string; status: string; summary?: string }>;
    topRoutines: Array<{
      activity: string;
      pillar: string;
      done: number;
      missed: number;
      total: number;
      showUpRate?: number;
    }>;
    consistencyHint?: string;
  };
};

export type RoutingContext = {
  userProfileId: string;
  assembledAt: string;

  identity: {
    displayName?: string;
    timezone: string;
    northStarGoal: string;
    healthOnboardingComplete: boolean;
  };

  integrations: UserKnowledgeIntegrations;

  recentTurns: RoutingRecentTurn[];

  pending: RoutingPendingState;

  activeWork: RoutingActiveWork;

  standing: RoutingStandingContext;

  growth: RoutingGrowthContext;

  routingHints: IntentRoutingHints;

  /** Full LLM routing parser output for capability filter and intent coercion. */
  parserSignals: RoutingContextSignals;

  gaps: string[];
};
