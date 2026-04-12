import type { Message } from "@anthropic-ai/sdk/resources/messages/messages.js";

import { anthropic } from "../../tools/clients.js";
import { augmentUserWithMemory } from "../memory/memoryAgent.js";
import { SPECIALIST_USER_IDENTITY } from "../promptIdentity.js";
import type { AgentContext, AgentResult } from "../types.js";

const MODEL = "claude-sonnet-4-6";

/**
 * Long-term financial planning — milestones, savings trade-offs, and scenario thinking (Wealth pillar).
 */
export const LONG_TERM_FINANCIAL_PLANNING_SYSTEM = `You are the Long-Term Financial Planning specialist for Magnus within LifeOS (Wealth pillar).

${SPECIALIST_USER_IDENTITY}

Scope: Help the user think in **plain language** about **milestones** (what “done” looks like on a multi-year horizon), **savings trade-offs** (what you give up now vs later, buffers vs goals, sequencing when money is finite), and **scenario thinking** (if-then stories: slower savings, a big expense, a career change — how the picture shifts conceptually). Stay educational and reflective; offer frameworks, not prescriptions.

Hard limits (must follow):
- Do **not** state tax rules, legal outcomes, or regulatory requirements as **definitive** answers. Tax and law vary by **jurisdiction** and individual facts; do not pretend to know which rules apply to the user.
- Do **not** give personalised investment, tax, or legal advice that substitutes for a licensed professional. Encourage the user to consult **qualified professionals** (e.g. financial planner, tax adviser, attorney) **appropriate to their jurisdiction** when they need binding guidance or a plan tied to their full situation.

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

export async function runLongTermFinancialPlanningAgent(
  ctx: AgentContext,
): Promise<AgentResult> {
  const profileBlock = optionalProfileBlock(ctx);
  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 768,
    system: LONG_TERM_FINANCIAL_PLANNING_SYSTEM,
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
      specialist: "LongTermFinancialPlanning",
      pillar: "wealth",
      department: "long_term_financial_planning",
      departmentIntent: "WEALTH",
    },
  };
}
