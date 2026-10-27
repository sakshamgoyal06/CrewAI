import { logger } from "../../logger.js";
import { loggableError } from "../../util/loggableError.js";
import { memoryConfig } from "./memoryConfig.js";
import type { MemoryPackage } from "./memoryPackage.js";
import { updateSemanticMemoryAfterTurn } from "./semanticMemory.js";
import { updateRollingSummaryAfterTurn } from "./summaryBuffer.js";
import { indexChatTurnEmbedding } from "./memoryEmbeddings.js";
import { memoryEmbeddingConfig } from "./memoryEmbeddingConfig.js";
import type { MemoryChatTurn } from "./types.js";

/**
 * Phases 2–3: async post-turn memory maintenance (summary buffer + semantic facts).
 * Safe to call without awaiting from the Telegram handler.
 */
export async function runPostTurnMemoryMaintenance(input: {
  userProfileId: string;
  userMessage: string;
  assistantReply: string;
  chronologicalTurns: MemoryChatTurn[];
}): Promise<void> {
  const config = memoryConfig();
  const embedConfig = memoryEmbeddingConfig();
  if (
    !config.summaryBufferEnabled &&
    !config.semanticExtractEnabled &&
    !embedConfig.enabled
  ) {
    return;
  }

  try {
    if (config.summaryBufferEnabled) {
      await updateRollingSummaryAfterTurn({
        userProfileId: input.userProfileId,
        chronologicalTurns: input.chronologicalTurns,
        config,
      });
    }
    if (config.semanticExtractEnabled) {
      await updateSemanticMemoryAfterTurn({
        userProfileId: input.userProfileId,
        userMessage: input.userMessage,
        assistantReply: input.assistantReply,
        config,
      });
    }
    if (embedConfig.enabled && embedConfig.indexChatTurns) {
      await indexChatTurnEmbedding({
        userProfileId: input.userProfileId,
        userMessage: input.userMessage,
        assistantReply: input.assistantReply,
      });
    }
  } catch (e) {
    logger.warn({ err: loggableError(e) }, "memory: post-turn maintenance failed");
  }
}

export function chronologicalTurnsFromPackage(
  pkg: MemoryPackage | undefined,
): MemoryChatTurn[] {
  return pkg?.chronologicalTurns ?? [];
}
