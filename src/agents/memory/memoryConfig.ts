/**
 * Tunable memory / context pipeline — all knobs via `MAGNUS_MEMORY_*` env vars.
 * See `.env.example` for defaults and descriptions.
 */

export type MemoryConfig = {
  /** Phase 1 — full recent turns in `messages[]` (not 160-char snippets). */
  conversationMessagesEnabled: boolean;
  /** How many recent turns to send verbatim to the model. */
  verbatimTurnLimit: number;
  /** How many chat rows to load from Supabase before splitting summary vs verbatim. */
  chatFetchLimit: number;
  /** Max characters kept per historical turn in the verbatim window. */
  turnContentMaxChars: number;

  /** Phase 2 — compress turns older than the verbatim window. */
  summaryBufferEnabled: boolean;
  /** Max characters for the rolling older-turn summary injected into context. */
  summaryMaxChars: number;
  /** Persist rolling summary to `memory_summaries` after each turn. */
  summaryPersistEnabled: boolean;
  /** When no stored summary exists, call the model to summarize older turns. */
  summaryGenerateOnMiss: boolean;
  /** Model for summary generation (use a cheap model in production). */
  summaryModel: string;

  /** Phase 3 — extract durable facts after each turn. */
  semanticExtractEnabled: boolean;
  /** Model for fact extraction. */
  semanticModel: string;
  /** Max semantic fact lines to inject into the memory block. */
  semanticFactsMaxInPrompt: number;
  /** Persist extracted facts to `memory_summaries`. */
  semanticPersistEnabled: boolean;

  /** Phase 4 — intent/query-aware inclusion of memory slices. */
  adaptiveRetrievalEnabled: boolean;
  /** Max characters for the structured memory block (goals, logs, facts — not chat). */
  memoryBlockMaxChars: number;
  /** Include `Data gaps: …` lines in the memory block (usually wasteful). */
  includeGapsInBlock: boolean;

  /** Snippet limits inside the memory block. */
  dailyLogSnippetChars: number;
  dailyLogsInBlock: number;
  rollingSummarySnippetChars: number;
  semanticFactSnippetChars: number;
};

function envInt(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return fallback;
  }
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function envBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) {
    return fallback;
  }
  if (raw === "true" || raw === "1" || raw === "yes") {
    return true;
  }
  if (raw === "false" || raw === "0" || raw === "no") {
    return false;
  }
  return fallback;
}

function envStr(name: string, fallback: string): string {
  const raw = process.env[name]?.trim();
  return raw || fallback;
}

/** Resolved once per process; restart to pick up env changes. */
let cached: MemoryConfig | null = null;

export function memoryConfig(): MemoryConfig {
  if (cached) {
    return cached;
  }
  cached = {
    conversationMessagesEnabled: envBool("MAGNUS_MEMORY_CONVERSATION_MESSAGES", true),
    verbatimTurnLimit: envInt("MAGNUS_MEMORY_VERBATIM_TURNS", 14),
    chatFetchLimit: envInt("MAGNUS_MEMORY_CHAT_FETCH_LIMIT", 48),
    turnContentMaxChars: envInt("MAGNUS_MEMORY_TURN_CONTENT_MAX_CHARS", 4000),

    summaryBufferEnabled: envBool("MAGNUS_MEMORY_SUMMARY_BUFFER", true),
    summaryMaxChars: envInt("MAGNUS_MEMORY_SUMMARY_MAX_CHARS", 2500),
    summaryPersistEnabled: envBool("MAGNUS_MEMORY_SUMMARY_PERSIST", true),
    summaryGenerateOnMiss: envBool("MAGNUS_MEMORY_SUMMARY_GENERATE_ON_MISS", true),
    summaryModel: envStr("MAGNUS_MEMORY_SUMMARY_MODEL", "claude-haiku-4-5"),

    semanticExtractEnabled: envBool("MAGNUS_MEMORY_SEMANTIC_EXTRACT", true),
    semanticModel: envStr("MAGNUS_MEMORY_SEMANTIC_MODEL", "claude-haiku-4-5"),
    semanticFactsMaxInPrompt: envInt("MAGNUS_MEMORY_SEMANTIC_FACTS_MAX", 12),
    semanticPersistEnabled: envBool("MAGNUS_MEMORY_SEMANTIC_PERSIST", true),

    adaptiveRetrievalEnabled: envBool("MAGNUS_MEMORY_ADAPTIVE_RETRIEVAL", true),
    memoryBlockMaxChars: envInt("MAGNUS_MEMORY_BLOCK_MAX_CHARS", 6000),
    includeGapsInBlock: envBool("MAGNUS_MEMORY_INCLUDE_GAPS", false),

    dailyLogSnippetChars: envInt("MAGNUS_MEMORY_DAILY_LOG_SNIPPET_CHARS", 400),
    dailyLogsInBlock: envInt("MAGNUS_MEMORY_DAILY_LOGS_IN_BLOCK", 6),
    rollingSummarySnippetChars: envInt("MAGNUS_MEMORY_ROLLING_SUMMARY_SNIPPET_CHARS", 800),
    semanticFactSnippetChars: envInt("MAGNUS_MEMORY_SEMANTIC_FACT_SNIPPET_CHARS", 200),
  };
  return cached;
}

/** Test helper — reset cached config between tests. */
export function resetMemoryConfigForTests(): void {
  cached = null;
}
