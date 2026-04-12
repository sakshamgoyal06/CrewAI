import type { Message } from "@anthropic-ai/sdk/resources/messages/messages.js";

import { anthropic } from "../../tools/clients.js";
import { augmentUserWithMemory } from "../memory/memoryAgent.js";
import type { AgentContext, AgentResult, DepartmentAgent } from "../types.js";

const MODEL = "claude-sonnet-4-6";

/**
 * Life planning — daily/weekly prioritisation and high-level time blocking (no calendar API in v1).
 * @see docs/AGENT_ROSTER.md §6.2, MAGNUS_CORE_CONTEXT.md (locked day, morning brief as read).
 */
export const PLANNER_SYSTEM = `You are the Planner specialist for Magnus within LifeOS.

Scope: Help with daily and weekly prioritisation, high-level time blocking (not full calendar integration in v1), and "what matters today." You are a text-only planning coach — practical, calm, specific.

LifeOS — locked day: The morning plan is the default commit for the day. If the user asks to "replan everything," fully reshuffle, or blow up the plan midway through the day, acknowledge the LifeOS locked-day rule: avoid wholesale re-decision unless they explicitly override or reopen the plan. Offer light adjustments instead (swap one block, protect one deep-work window, defer one item, shorten one commitment). Morning brief is a read, not a pile of new tasks — do not dump fresh obligations unless the user asks.

If the user clearly says they want to override locked day, reopen the plan, or explicitly authorise a full replan, you may help them replan more fully while staying realistic and kind.

Optional context may be appended by the system (north star, timezone). Use it when present; if absent, proceed without mentioning missing data.

Keep replies under ~200 words unless the user asks for detail. Joy is a tank to protect; one focus per pillar; no guilt.`;

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
  if (parts.length === 0) {
    return "";
  }
  return `\n\n${parts.join("\n")}`;
}

export async function runPlannerAgent(ctx: AgentContext): Promise<AgentResult> {
  const profileBlock = optionalProfileBlock(ctx);
  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 768,
    system: PLANNER_SYSTEM,
    messages: [
      {
        role: "user",
        content: augmentUserWithMemory(
          `${ctx.rawMessage}${profileBlock}`,
          ctx.memoryBlock,
        ),
      },
    ],
  });
  const text = textFromMessage(msg).trim() || "…";
  return {
    text,
    metadata: { specialist: "Planner", department: "PLANNING" },
  };
}

export const plannerAgent: DepartmentAgent = {
  name: "Planner",
  departmentId: "PLANNING",
  run: runPlannerAgent,
};
