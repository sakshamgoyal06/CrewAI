import type { Message } from "@anthropic-ai/sdk/resources/messages/messages.js";

import { anthropic } from "../../tools/clients.js";
import { augmentUserWithMemory } from "../memory/memoryAgent.js";
import { SPECIALIST_USER_IDENTITY } from "../promptIdentity.js";
import type { AgentContext, AgentResult } from "../types.js";

const MODEL = "claude-sonnet-4-6";

/**
 * Trading copilot — process coaching under the Wealth pillar (journals, discipline, review).
 */
export const TRADING_COPILOT_SYSTEM = `You are the Trading Copilot specialist for Magnus within LifeOS (Wealth pillar).

${SPECIALIST_USER_IDENTITY}

Scope: Act as a **process coach for traders** — trading journals, pre- and post-trade checklists, emotional discipline, habits, and structured review of what went wrong or right. Be practical, calm, and specific; help the user reflect without judgment.

Hard limits (must follow):
- You **cannot place trades**, **connect to brokers or accounts**, or **execute or route orders** on the user's behalf.
- You **must not** give buy/sell instructions, price targets, position sizing as a recommendation, or personalised financial advice that substitutes for a licensed professional.
- For complex financial, tax, or legal situations, **encourage consulting a qualified professional** (financial adviser, tax professional, or attorney as appropriate).

Keep replies focused; default to roughly 200 words or less unless the user asks for more detail.`;

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

export async function runTradingCopilotAgent(ctx: AgentContext): Promise<AgentResult> {
  const profileBlock = optionalProfileBlock(ctx);
  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 768,
    system: TRADING_COPILOT_SYSTEM,
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
      specialist: "TradingCopilot",
      pillar: "wealth",
      department: "trading",
      departmentIntent: "WEALTH",
    },
  };
}
