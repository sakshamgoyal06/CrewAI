/**
 * Frontload routing context — assembled once per turn before intent classification.
 * Scoped strictly by user_profile_id (multi-tenant safe).
 */
import type { IntentRoutingHints } from "../routing/intentRoutingHints.js";
import type { UserKnowledgeIntegrations } from "../memory/userKnowledge.js";

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
  gymEventToday: boolean;
  openCommitmentCount: number;
};

/** Standing rules and preferences surfaced for routing (meal rules, avoid lists). */
export type RoutingStandingContext = {
  /** Short bullets from program_learnings / restrictions — max ~6 lines. */
  programNotes: string[];
  /** Semantic facts most relevant to routing disambiguation. */
  routingFacts: string[];
};

/** Growth-aligned snapshot — lists, goals, behavior, today's win, KPIs. */
export type RoutingGrowthContext = {
  localTime: {
    dateKey: string;
    hour: number;
    minute: number;
    isLateEvening: boolean;
  };
  lists: Array<{ slug: string; displayName: string; openCount: number }>;
  listHighlights: Array<{ slug: string; title: string; status?: string }>;
  goals: Array<{ title: string; pillar: string; status: string }>;
  todayWin: {
    morningIntention?: string;
    energyLevel?: number;
    winConditionPending?: { phase: string; candidateText?: string };
  };
  behavior: {
    recentIssues: string[];
    recentWins: string[];
    dailyLogSnippets: Array<{ date: string; snippet: string }>;
    /** Compact bullets for classifier and growth-aligned routing. */
    narrativeBullets: string[];
  };
  kpis: {
    joyTank?: { level: number; date: string };
    pillarStatus: Array<{ pillar: string; status: string; summary?: string }>;
    activityStats: Array<{
      activity: string;
      pillar: string;
      done: number;
      missed: number;
      total: number;
      showUpRate?: number;
    }>;
    gymMissStreakDays?: number;
    routineConsistencyHint?: string;
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

  /** Lists, goals, logged behavior, today's win, joy/consistency KPIs. */
  growth: RoutingGrowthContext;

  routingHints: IntentRoutingHints;

  gaps: string[];
};
