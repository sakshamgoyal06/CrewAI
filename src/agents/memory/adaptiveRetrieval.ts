import type { Intent } from "../../intent.js";
import type { MemoryConfig } from "./memoryConfig.js";

/** Which non-chat memory slices to load for a turn (Phase 4). */
export type MemoryRetrievalProfile = {
  includeDailyLogs: boolean;
  includeDailyScores: boolean;
  includeGoals: boolean;
  includeJoy: boolean;
  includePatterns: boolean;
  includeRollingSummaries: boolean;
  includeSemanticFacts: boolean;
  includeGaps: boolean;
  /** When false, chat snippets are omitted from the memory block (history is in `messages[]`). */
  includeChatSnippetsInBlock: boolean;
  memoryBlockMaxChars: number;
  verbatimTurnLimit: number;
};

const FITNESS_PATTERN =
  /\b(hevy|workout|gym|training|exercise|pull|push|legs|cardio|bench|squat|deadlift|treadmill|sets?|reps?|pr\b)\b/i;
const NUTRITION_PATTERN =
  /\b(meal|macro|calorie|protein|carb|fat|eat|ate|food|nutrition|diet)\b/i;
const CALENDAR_PATTERN =
  /\b(calendar|schedule|event|meeting|tomorrow|today|agenda|book|block time)\b/i;

function baseProfile(config: MemoryConfig): MemoryRetrievalProfile {
  return {
    includeDailyLogs: true,
    includeDailyScores: true,
    includeGoals: true,
    includeJoy: true,
    includePatterns: true,
    includeRollingSummaries: true,
    includeSemanticFacts: true,
    includeGaps: config.includeGapsInBlock,
    includeChatSnippetsInBlock: !config.conversationMessagesEnabled,
    memoryBlockMaxChars: config.memoryBlockMaxChars,
    verbatimTurnLimit: config.verbatimTurnLimit,
  };
}

/**
 * Intent- and keyword-aware memory inclusion. Reduces token noise on focused turns.
 */
export function resolveMemoryRetrievalProfile(
  intent: Intent,
  rawMessage: string,
  config: MemoryConfig,
): MemoryRetrievalProfile {
  if (!config.adaptiveRetrievalEnabled) {
    return baseProfile(config);
  }

  const msg = rawMessage.trim();
  const profile = baseProfile(config);

  if (intent === "GENERAL" && CALENDAR_PATTERN.test(msg)) {
    return {
      ...profile,
      includeDailyScores: false,
      includePatterns: false,
      includeJoy: false,
      memoryBlockMaxChars: Math.min(profile.memoryBlockMaxChars, 3000),
    };
  }

  if (intent === "HEALTH") {
    if (FITNESS_PATTERN.test(msg) && !NUTRITION_PATTERN.test(msg)) {
      return {
        ...profile,
        includeDailyLogs: false,
        includeDailyScores: false,
        includeJoy: false,
        includePatterns: false,
        memoryBlockMaxChars: Math.min(profile.memoryBlockMaxChars, 3500),
      };
    }
    if (NUTRITION_PATTERN.test(msg) && !FITNESS_PATTERN.test(msg)) {
      return {
        ...profile,
        includePatterns: false,
        includeJoy: false,
        verbatimTurnLimit: Math.max(6, profile.verbatimTurnLimit - 2),
      };
    }
  }

  if (intent === "WEALTH" || intent === "WISDOM") {
    return {
      ...profile,
      includeDailyScores: false,
      includeJoy: intent !== "HAPPINESS",
      includePatterns: false,
      includeDailyLogs: intent === "WISDOM",
    };
  }

  if (intent === "HAPPINESS") {
    return {
      ...profile,
      includeDailyScores: false,
      includeGoals: false,
      includePatterns: false,
    };
  }

  return profile;
}
