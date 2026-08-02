/**
 * One shared implementation for the light pillar specialists (Wealth, Happiness, Wisdom).
 *
 * Health is deliberately not built on this: it owns sub-specialists, external data (Hevy, meal
 * providers, program memory) and its own router. The other three are prompt-only today, so they
 * differ by system prompt and metadata alone — keeping them in one runner means a change to
 * memory handling or model settings lands everywhere at once.
 *
 * The user never sees which pillar answered. Magnus routes silently.
 */
import type { Message } from "@anthropic-ai/sdk/resources/messages/messages.js";

import { anthropic } from "../tools/clients.js";
import { buildAgentMessages } from "./memory/memoryAgent.js";
import { buildSpecialistIdentity } from "./promptIdentity.js";
import type { AgentContext, AgentResult } from "./types.js";

export const PILLAR_MODEL = "claude-sonnet-4-6";

function textFromMessage(msg: Message): string {
  for (const block of msg.content) {
    if (block.type === "text") {
      return block.text;
    }
  }
  return "";
}

function optionalProfileBlock(ctx: AgentContext): string {
  const parts: string[] = [];
  if (ctx.northStarGoal?.trim()) {
    parts.push(`North star (from profile): ${ctx.northStarGoal.trim()}`);
  }
  if (ctx.timezone?.trim()) {
    parts.push(`Timezone (from profile): ${ctx.timezone.trim()}`);
  }
  return parts.length === 0 ? "" : `\n\n${parts.join("\n")}`;
}

export async function runPillarSpecialist(input: {
  ctx: AgentContext;
  system: string;
  specialist: string;
  pillar: string;
  maxTokens?: number;
}): Promise<AgentResult> {
  const msg = await anthropic.messages.create({
    model: PILLAR_MODEL,
    max_tokens: input.maxTokens ?? 768,
    system: `${buildSpecialistIdentity(input.ctx)}\n\n${input.system}`,
    messages: buildAgentMessages(
      input.ctx,
      `${input.ctx.rawMessage}${optionalProfileBlock(input.ctx)}`,
    ),
  });

  return {
    text: textFromMessage(msg).trim() || "…",
    metadata: {
      specialist: input.specialist,
      pillar: input.pillar,
    },
  };
}
