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

/** Row from `magnus_daily_logs` — free-form notes mirrored from Notion / Telegram. */
export type MemoryDailyLogEntry = {
  body: string;
  logDate: string;
  source?: string;
  createdAt: string;
};

export type MemoryContext = {
  purpose: MemoryPurpose;
  loadedAt: string;
  /** Core profile fields when `user_profile` loads; otherwise null with a gap. */
  profile: {
    northStarGoal?: string;
    timezone?: string;
    userTier?: string;
  } | null;
  recentSignals: {
    recentChatTurns: MemoryChatTurn[];
    /** Recent rows from `daily_scores` when present. */
    dailyScores?: Array<Record<string, unknown>>;
    /** Recent rows from `magnus_daily_logs` when present. */
    dailyLogs?: MemoryDailyLogEntry[];
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
  /**
   * Explicit missing data or failed optional queries — never silent empty failure.
   */
  gaps: string[];
};
