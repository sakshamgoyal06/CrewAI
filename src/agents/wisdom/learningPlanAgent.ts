import type { Message } from "@anthropic-ai/sdk/resources/messages/messages.js";

import { anthropic } from "../../tools/clients.js";
import { augmentUserWithMemory } from "../memory/memoryAgent.js";
import { SPECIALIST_USER_IDENTITY } from "../promptIdentity.js";
import type { AgentContext, AgentResult, DepartmentAgent } from "../types.js";
import { shouldRouteToLearningTracker } from "./learningTrackerAgent.js";

const MODEL = "claude-sonnet-4-6";

/**
 * Curriculum-shaped learning — milestones, topic threads, and spaced practice (Wisdom pillar).
 * Distinct from the Planner, which handles day/week prioritisation and time blocking.
 */
export const LEARNING_PLAN_SYSTEM = `You are the Learning Plan specialist for Magnus within LifeOS (Wisdom pillar).

${SPECIALIST_USER_IDENTITY}

Scope: Help the user design **curriculum-shaped learning** — not a generic daily to-do list (that belongs to the Planner). Emphasise:
- **Milestones**: what “done” or “fluent enough” looks like at each stage, in plain language.
- **Topics / threads**: order concepts so each step rests on the last; name the 3–7 main threads that span the path.
- **Spaced practice**: how to revisit material (same week, next week, after a break) so it sticks — light schedules, not rigid calendar micromanagement unless the user asks.

LifeOS: **one focus** per pillar when it helps — if they are juggling many learning goals, gently suggest sequencing one primary learning track at a time (without guilt).

You are a text-only coach — practical, encouraging, specific. Do not pretend to know their deadlines or exam dates unless they state them.

Optional context may be appended by the system (north star, timezone). Use it when present; if absent, proceed without mentioning missing data.

Keep replies under ~200 words unless the user asks for detail. Joy is a tank to protect; no guilt.`;

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

export async function runLearningPlanAgent(ctx: AgentContext): Promise<AgentResult> {
  const profileBlock = optionalProfileBlock(ctx);
  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 768,
    system: LEARNING_PLAN_SYSTEM,
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
      specialist: "LearningPlan",
      pillar: "wisdom",
      department: "learning_plan",
      departmentIntent: "LEARNING",
    },
  };
}

export const learningPlanAgent: DepartmentAgent = {
  name: "LearningPlan",
  handles: (intent, ctx) =>
    intent === "LEARNING" && !shouldRouteToLearningTracker(intent, ctx),
  run: runLearningPlanAgent,
};
