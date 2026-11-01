/**
 * Step 1 — explicit context slice matrix (Cursor dynamic-discovery spine).
 * Combines intent, minimal mode, and message signals into a retrieval profile.
 */
import type { Intent } from "../../intent.js";
import { isMinimalMode } from "../../config/minimalMode.js";
import type { MemoryConfig } from "./memoryConfig.js";
import {
  resolveMemoryRetrievalProfile,
  type MemoryRetrievalProfile,
} from "./adaptiveRetrieval.js";

export type ContextSliceInput = {
  intent: Intent;
  rawMessage: string;
  config: MemoryConfig;
  minimalMode?: boolean;
};

const CALENDAR_PATTERN =
  /\b(calendar|schedule|event|meeting|tomorrow|today|agenda|book|block time|remind)\b/i;
const LIST_PATTERN =
  /\b(watchlist|readlist|list_items|add .+ to .+list|recommend .+ from .+ list|tasks?|todo)\b/i;

/** Calendar / list focused turns — smaller verbatim window (Step 1). */
export function isGeneralFocusedToolTurn(rawMessage: string): boolean {
  const msg = rawMessage.trim();
  return CALENDAR_PATTERN.test(msg) || LIST_PATTERN.test(msg);
}

/**
 * Select which memory slices load for this turn.
 * Wraps adaptive retrieval and applies minimal-mode + focused-turn caps.
 */
export function selectContextSlice(input: ContextSliceInput): MemoryRetrievalProfile {
  const minimal = input.minimalMode ?? isMinimalMode();
  let profile = resolveMemoryRetrievalProfile(
    input.intent,
    input.rawMessage,
    input.config,
  );

  if (input.intent === "GENERAL" && isGeneralFocusedToolTurn(input.rawMessage)) {
    profile = {
      ...profile,
      includeDailyScores: false,
      includeDailyLogs: false,
      includePatterns: false,
      includeJoy: false,
      includeGoals: false,
      includeRollingSummaries: false,
      verbatimTurnLimit: Math.min(
        profile.verbatimTurnLimit,
        input.config.generalFocusedVerbatimTurns,
      ),
      memoryBlockMaxChars: Math.min(profile.memoryBlockMaxChars, 3500),
      includeTopicIndexOnly: input.config.topicIndexOnly,
    };
  }

  if (minimal && input.intent === "GENERAL") {
    profile = {
      ...profile,
      includeDailyScores: false,
      includePatterns: false,
      includeJoy: false,
      includeTopicIndexOnly: input.config.topicIndexOnly,
    };
  }

  if (minimal && input.intent === "HEALTH") {
    profile = {
      ...profile,
      includeJoy: false,
      includeGoals: false,
      includeDailyLogs: false,
    };
  }

  if (input.config.topicIndexOnly && profile.includeSemanticFacts) {
    profile = { ...profile, includeTopicIndexOnly: true };
  }

  return profile;
}
