/**
 * Structured tiered memory for Magnus orchestrator and ritual agents (not user-facing).
 */
export type MemoryPurpose = "chat" | "brief" | "pattern";

export type MemoryChatTurn = {
  role: "user" | "assistant" | "system";
  /** Truncated in-memory copy for LLM context (full text may be longer in DB). */
  content: string;
  intent: string | null;
  createdAt: string;
};

export type MemoryGoalRow = {
  id: string;
  label: string;
  pillar?: string;
  status?: string;
  timeframe?: string;
};

export type MemoryListCatalogEntry = {
  slug: string;
  displayName: string;
  openCount: number;
  notionLinked: boolean;
};

export type MemoryListHighlight = {
  slug: string;
  title: string;
  status?: string;
};

/** Row from `magnus_daily_logs` — free-form notes mirrored from Notion / Telegram. */
export type MemoryDailyLogEntry = {
  body: string;
  logDate: string;
  source?: string;
  createdAt: string;
};

/**
 * Row from `magnus_events` — a commitment near today, so Magnus knows what is on and what slipped
 * without spending a tool round to find out.
 */
export type MemoryEventEntry = {
  title: string;
  status: string;
  pillar?: string;
  /** ISO instant; absent for a commitment with no time on it yet. */
  plannedStartAt?: string;
  timeZone?: string;
  allDay?: boolean;
  /** How many times this commitment has already been moved. */
  moves?: number;
  reason?: string;
};

export type MemoryContext = {
  purpose: MemoryPurpose;
  loadedAt: string;
  /** Core profile fields when `user_profile` loads; otherwise null with a gap. */
  profile: {
    northStarGoal?: string;
    timezone?: string;
    userTier?: string;
    displayName?: string;
  } | null;
  recentSignals: {
    /** Chronological chat turns (may exceed verbatim window; split in memoryPackage). */
    recentChatTurns: MemoryChatTurn[];
    /** Recent rows from `daily_scores` when present. */
    dailyScores?: Array<Record<string, unknown>>;
    /** Recent rows from `magnus_daily_logs` when present. */
    dailyLogs?: MemoryDailyLogEntry[];
    /** Commitments from `magnus_events` in the window around today. */
    events?: MemoryEventEntry[];
  };
  rollingSummaries: {
    summary7d?: string;
    summary30d?: string;
  };
  activeGoals: MemoryGoalRow[];
  /** Joy / happiness layer — e.g. `happiness_reserve` or chat-derived hints. */
  joy: {
    summary?: string;
    happinessReserve?: Record<string, unknown> | null;
  };
  patterns: Array<Record<string, unknown>>;
  /** Per-user list catalog and open-item highlights from magnus_user_lists. */
  lists?: {
    notionConnected: boolean;
    catalog: MemoryListCatalogEntry[];
    openHighlights: MemoryListHighlight[];
  };
  /**
   * Explicit missing data or failed optional queries — never silent empty failure.
   */
  gaps: string[];
};
