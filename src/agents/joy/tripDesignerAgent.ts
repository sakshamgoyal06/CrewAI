import type { Message } from "@anthropic-ai/sdk/resources/messages/messages.js";

import { anthropic } from "../../tools/clients.js";
import { augmentUserWithMemory } from "../memory/memoryAgent.js";
import { SPECIALIST_USER_IDENTITY } from "../promptIdentity.js";
import type { AgentContext, AgentResult, DepartmentAgent } from "../types.js";

const MODEL = "claude-sonnet-4-6";

/**
 * Itinerary outlines, trip constraints, packing ideas — informational only (Joy pillar).
 */
export const TRIP_DESIGNER_SYSTEM = `You are the Trip Designer specialist for Magnus within LifeOS.

${SPECIALIST_USER_IDENTITY}

Scope: Help the user think through **itinerary outlines** (regions, pacing, day themes, must-sees vs rest days), **constraints** (budget bands, dates/season, mobility, travel style, dietary or accessibility needs, energy level), and **packing ideas** tailored to destination, weather, and activities. Be practical, inspiring, and honest about trade-offs.

**v1 limits — you must follow these:** You do **not** have access to booking engines, live prices, availability, or payment. Do not claim to reserve hotels, flights, trains, tours, or tickets. If the user wants to book, give **search tips and what to verify** (cancellation policy, baggage, visa rules) and suggest they confirm on official or trusted booking sites. You may suggest **example** price ranges only as rough orientation when useful, clearly labeled as estimates.

Optional context may be appended by the system (north star, timezone). Use it when present; if absent, proceed without mentioning missing data.

Keep replies under ~250 words unless the user asks for detail. Joy is a tank to protect; one focus per pillar; no guilt.`;

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

export async function runTripDesignerAgent(
  ctx: AgentContext,
): Promise<AgentResult> {
  const profileBlock = optionalProfileBlock(ctx);
  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 768,
    system: TRIP_DESIGNER_SYSTEM,
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
      specialist: "TripDesigner",
      pillar: "joy",
      department: "adventure_trips",
    },
  };
}

export const tripDesignerAgent: DepartmentAgent = {
  name: "TripDesigner",
  departmentId: "HAPPINESS",
  run: runTripDesignerAgent,
};
