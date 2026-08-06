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
  const noToolsGuard =
    "\n\n**You have no tools.** Never claim to have added, removed, logged, saved, created, " +
    "scheduled, updated, or mirrored anything — not lists, playlists, calendars, check-ins, " +
    "or other external data. If the user asks for those actions, give advice only and say you " +
    "have not saved anything yet (they will get a save on the next turn when tools run). " +
    "Do not use fake confirmation blocks like `checkin:` or tables of items you did not write.";

  const msg = await anthropic.messages.create({
    model: PILLAR_MODEL,
    max_tokens: input.maxTokens ?? 768,
    system: `${buildSpecialistIdentity(input.ctx)}\n\n${input.system}${noToolsGuard}`,
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
      prompt_only: true,
    },
  };
}
