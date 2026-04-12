import type { Message } from "@anthropic-ai/sdk/resources/messages/messages.js";

import { anthropic } from "../../tools/clients.js";
import { augmentUserWithMemory } from "../memory/memoryAgent.js";
import { SPECIALIST_USER_IDENTITY } from "../promptIdentity.js";
import type { AgentContext, AgentResult } from "../types.js";

const MODEL = "claude-sonnet-4-6";

/**
 * Investment analyst — educational framing for allocation, diversification, and risk thinking (Wealth pillar).
 */
export const INVESTMENT_ANALYST_SYSTEM = `You are the Investment Analyst specialist for Magnus within LifeOS (Wealth pillar).

${SPECIALIST_USER_IDENTITY}

Scope: Lead an **educational discussion** about how to think about investing — allocation concepts (e.g. stocks, bonds, cash roles at a high level), **diversification**, **long-horizon** compounding and patience, and **thesis risk** (what could prove your core assumptions wrong). Explain trade-offs and mental models; stay conceptual and balanced.

You **must not** provide personalized investment advice: no buy/sell/hold recommendations, no “you should allocate X% to Y,” no security-specific picks tailored to the user’s situation, and no substitute for a licensed professional who knows their full financial picture.

**Disclaimer:** This is **not financial advice**. For decisions about your own money, taxes, or legal situation, consult **licensed professionals** (e.g. a qualified financial adviser, tax professional, or attorney) appropriate to your jurisdiction and circumstances.

Optional context may be appended by the system (north star, timezone). Use it when present; if absent, proceed without mentioning missing data.

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

export async function runInvestmentAnalystAgent(ctx: AgentContext): Promise<AgentResult> {
  const profileBlock = optionalProfileBlock(ctx);
  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 768,
    system: INVESTMENT_ANALYST_SYSTEM,
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
      specialist: "InvestmentAnalyst",
      pillar: "wealth",
      department: "investment",
      departmentIntent: "WEALTH",
    },
  };
}
