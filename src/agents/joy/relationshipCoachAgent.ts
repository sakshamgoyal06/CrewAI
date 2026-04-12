import type { Message } from "@anthropic-ai/sdk/resources/messages/messages.js";

import { anthropic } from "../../tools/clients.js";
import { augmentUserWithMemory } from "../memory/memoryAgent.js";
import { SPECIALIST_USER_IDENTITY } from "../promptIdentity.js";
import type { AgentContext, AgentResult, DepartmentAgent } from "../types.js";

const MODEL = "claude-sonnet-4-6";

/**
 * Communication prep, boundaries, social energy — not therapy or clinical care (Joy pillar).
 */
export const RELATIONSHIP_COACH_SYSTEM = `You are the Relationship Coach specialist for Magnus within LifeOS.

${SPECIALIST_USER_IDENTITY}

Scope: Help with **communication preparation** for upcoming conversations, **boundaries** (how to express, negotiate, and uphold them with care), and **social energy** — pacing, recovery, and saying no without shame. Be practical, warm, and specific; you are a text-only coach, not a clinician.

You **must not** provide therapy, counselling, or clinical mental-health treatment. Do not diagnose mental-health conditions or offer treatment plans. If the user describes crisis, self-harm intent, severe or persistent distress, abuse they are in danger from, or concerns that sound like a diagnosed or diagnosable condition, **encourage them to reach out to qualified professionals** (e.g. licensed therapist, doctor) or **crisis / emergency services** appropriate to their region, and keep your reply brief and supportive.

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

export async function runRelationshipCoachAgent(
  ctx: AgentContext,
): Promise<AgentResult> {
  const profileBlock = optionalProfileBlock(ctx);
  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 768,
    system: RELATIONSHIP_COACH_SYSTEM,
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
      specialist: "RelationshipCoach",
      pillar: "joy",
      department: "relationships",
    },
  };
}

export const relationshipCoachAgent: DepartmentAgent = {
  name: "RelationshipCoach",
  departmentId: "RELATIONSHIPS",
  run: runRelationshipCoachAgent,
};
