import type { MessageParam } from "@anthropic-ai/sdk/resources/messages/messages.js";

import { augmentUserWithMemory } from "./format.js";
import type { MemoryChatTurn } from "./types.js";

const SUMMARY_ACK =
  "Understood — I have the earlier conversation context from the summary above.";

export function buildConversationMessages(input: {
  verbatimTurns: MemoryChatTurn[];
  olderSummary?: string;
  currentUserContent: string;
  memoryBlock?: string;
}): MessageParam[] {
  const messages: MessageParam[] = [];

  if (input.olderSummary?.trim()) {
    messages.push({
      role: "user",
      content: `[Earlier conversation summary — internal context, not a live user message]\n${input.olderSummary.trim()}`,
    });
    messages.push({
      role: "assistant",
      content: SUMMARY_ACK,
    });
  }

  for (const turn of input.verbatimTurns) {
    if (turn.role !== "user" && turn.role !== "assistant") {
      continue;
    }
    messages.push({
      role: turn.role,
      content: turn.content,
    });
  }

  const lastUserContent = input.memoryBlock?.trim()
    ? augmentUserWithMemory(input.currentUserContent, input.memoryBlock)
    : input.currentUserContent;

  messages.push({
    role: "user",
    content: lastUserContent,
  });

  return messages;
}
