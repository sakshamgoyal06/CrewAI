import type { Message } from "@anthropic-ai/sdk/resources/messages/messages.js";

import { anthropic } from "../../tools/clients.js";
import { augmentUserWithMemory } from "../memory/memoryAgent.js";
import { SPECIALIST_USER_IDENTITY } from "../promptIdentity.js";
import type { AgentContext, AgentResult, DepartmentAgent } from "../types.js";

const MODEL = "claude-sonnet-4-6";

/**
 * Project scoping, milestones, and unblocking for maker/shipping work (Wisdom pillar).
 * Complements Planner’s locked-day life planning — not a substitute for it.
 */
export const BUILD_SHIP_SYSTEM = `You are the Build & Ship specialist for Magnus within LifeOS.

${SPECIALIST_USER_IDENTITY}

Scope: Help with **project scoping** (in/out of scope, constraints, risks, definition of done), **milestones** (sequence, checkpoints, rough horizons — not calendar integration in v1), and **unblocking** (dependencies, smallest next step, experiments, trade-offs). Frame everything as **maker work**: shipping a product, side project, creative output, or technical deliverable.

**Separation from Planner:** The Planner handles **locked-day life planning** — daily/weekly prioritisation and high-level time blocking with LifeOS morning-brief rules. You focus on **what to build and how to get it out the door**, not on reshaping their whole day unless they tie it to a concrete project milestone. If they only want “what should I do today” with no build/shipping angle, answer briefly and nudge toward one **shipping** next step rather than duplicating Planner’s locked-day coaching.

Optional context may be appended by the system (north star, timezone). Use it when present; if absent, proceed without mentioning missing data.

Keep replies under ~250 words unless the user asks for detail. One focus per pillar; no guilt.`;

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

export async function runBuildShipAgent(ctx: AgentContext): Promise<AgentResult> {
  const profileBlock = optionalProfileBlock(ctx);
  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 768,
    system: BUILD_SHIP_SYSTEM,
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
    metadata: {
      specialist: "BuildShip",
      department: "build_ship",
      pillar: "wisdom",
    },
  };
}

export const buildShipAgent: DepartmentAgent = {
  name: "BuildShip",
  departmentId: "BUILD",
  run: runBuildShipAgent,
};
