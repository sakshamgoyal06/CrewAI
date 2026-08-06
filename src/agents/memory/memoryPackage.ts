import type { Intent } from "../../intent.js";
import type { MemoryRetrievalProfile } from "./adaptiveRetrieval.js";
import { resolveMemoryRetrievalProfile } from "./adaptiveRetrieval.js";
import { memoryConfig } from "./memoryConfig.js";
import { loadSemanticFacts } from "./semanticMemory.js";
import {
  excludeDuplicateCurrentUserTurn,
  generateConversationSummary,
  loadRollingConversationSummary,
  splitChatTurnsForBuffer,
} from "./summaryBuffer.js";
import type { MemoryContext, MemoryChatTurn } from "./types.js";
import { formatMemoryBlockForSystem } from "./format.js";
import {
  formatUserKnowledgeBlock,
  loadUserKnowledgeLayer,
  userKnowledgeEnabled,
} from "./userKnowledge.js";

export type MemoryPackage = {
  verbatimTurns: MemoryChatTurn[];
  olderSummary?: string;
  semanticFacts: string[];
  memoryBlock: string;
  /** Stable user pointers (lists, integrations, health watch) prepended to memoryBlock. */
  userKnowledgeBlock?: string;
  retrievalProfile: MemoryRetrievalProfile;
  /** Full chronological turns loaded this turn (for post-turn summary update). */
  chronologicalTurns: MemoryChatTurn[];
};

export async function buildMemoryPackage(input: {
  memory: MemoryContext;
  intent: Intent;
  rawMessage: string;
  userProfileId: string;
}): Promise<MemoryPackage> {
  const config = memoryConfig();
  const profile = resolveMemoryRetrievalProfile(input.intent, input.rawMessage, config);

  const allTurns = input.memory.recentSignals.recentChatTurns.map((t) => ({
    ...t,
    content:
      t.content.length > config.turnContentMaxChars
        ? `${t.content.slice(0, config.turnContentMaxChars)}…`
        : t.content,
  }));

  const chronological = excludeDuplicateCurrentUserTurn(allTurns, input.rawMessage);
  const { verbatim, older } = splitChatTurnsForBuffer(
    chronological,
    profile.verbatimTurnLimit,
  );

  let olderSummary: string | undefined;
  if (config.summaryBufferEnabled) {
    olderSummary = await loadRollingConversationSummary(input.userProfileId);
    if (!olderSummary && older.length > 0 && config.summaryGenerateOnMiss) {
      olderSummary = await generateConversationSummary(older, undefined, config);
    }
    if (olderSummary && olderSummary.length > config.summaryMaxChars) {
      olderSummary = `${olderSummary.slice(0, config.summaryMaxChars)}…`;
    }
  }

  let semanticFacts: string[] = [];
  if (profile.includeSemanticFacts && config.semanticExtractEnabled) {
    semanticFacts = await loadSemanticFacts(
      input.userProfileId,
      config.semanticFactsMaxInPrompt,
    );
  }

  const memoryBlockBase = formatMemoryBlockForSystem(input.memory, profile, {
    semanticFacts,
    omitChatSnippets: config.conversationMessagesEnabled,
  });

  let userKnowledgeBlock: string | undefined;
  let memoryBlock = memoryBlockBase;
  if (userKnowledgeEnabled()) {
    const knowledge = await loadUserKnowledgeLayer(input.userProfileId, {
      intent: input.intent,
      rawMessage: input.rawMessage,
      memory: input.memory,
    });
    userKnowledgeBlock = formatUserKnowledgeBlock(knowledge, {
      intent: input.intent,
      rawMessage: input.rawMessage,
    });
    if (userKnowledgeBlock.trim()) {
      memoryBlock = `${userKnowledgeBlock.trim()}\n\n${memoryBlockBase}`;
    }
  }

  return {
    verbatimTurns: verbatim,
    olderSummary,
    semanticFacts,
    memoryBlock,
    userKnowledgeBlock,
    retrievalProfile: profile,
    chronologicalTurns: chronological,
  };
}
