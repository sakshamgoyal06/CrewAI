import type { MessageParam } from "@anthropic-ai/sdk/resources/messages/messages.js";

import type { AgentContext } from "../types.js";
import { buildConversationMessages } from "./conversationMessages.js";
import { augmentUserWithMemory } from "./format.js";
import { memoryConfig } from "./memoryConfig.js";
import {
  excludeDuplicateCurrentUserTurn,
} from "./summaryBuffer.js";

/**
 * Build Anthropic `messages[]` for a specialist or Magnus turn.
 * Phase 1: verbatim history; Phase 2: optional older summary prefix.
 */
export function buildAgentMessages(
  ctx: AgentContext,
  currentUserContent: string,
): MessageParam[] {
  const config = memoryConfig();
  const pkg = ctx.memoryPackage;

  if (config.conversationMessagesEnabled && pkg) {
    const verbatim = excludeDuplicateCurrentUserTurn(pkg.verbatimTurns, ctx.rawMessage);
    return buildConversationMessages({
      verbatimTurns: verbatim,
      olderSummary: pkg.olderSummary,
      currentUserContent,
      memoryBlock: pkg.memoryBlock,
    });
  }

  const block = pkg?.memoryBlock ?? ctx.memoryBlock;
  return [
    {
      role: "user",
      content: augmentUserWithMemory(currentUserContent, block),
    },
  ];
}

/**
 * For tool-loop agents: history prefix before the first user turn (tool rounds append after).
 */
export function buildAgentHistoryPrefix(ctx: AgentContext): MessageParam[] {
  const config = memoryConfig();
  const pkg = ctx.memoryPackage;
  if (!config.conversationMessagesEnabled || !pkg) {
    return [];
  }

  const messages: MessageParam[] = [];
  if (pkg.olderSummary?.trim()) {
    messages.push({
      role: "user",
      content: `[Earlier conversation summary — internal context, not a live user message]\n${pkg.olderSummary.trim()}`,
    });
    messages.push({
      role: "assistant",
      content: "Understood — I have the earlier conversation context from the summary above.",
    });
  }

  const verbatim = excludeDuplicateCurrentUserTurn(pkg.verbatimTurns, ctx.rawMessage);
  for (const turn of verbatim) {
    if (turn.role === "user" || turn.role === "assistant") {
      messages.push({ role: turn.role, content: turn.content });
    }
  }
  return messages;
}
