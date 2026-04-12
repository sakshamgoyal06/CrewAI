import type { Message } from "@anthropic-ai/sdk/resources/messages/messages.js";

import { anthropic } from "../../tools/clients.js";
import { augmentUserWithMemory } from "../memory/memoryAgent.js";
import { SPECIALIST_USER_IDENTITY } from "../promptIdentity.js";
import type { AgentContext, AgentResult } from "../types.js";

const MODEL = "claude-sonnet-4-6";

/**
 * FIRE (Financial Independence / Retire Early) — educational framing: savings rate, rough timeline intuition, trade-offs (Wealth pillar).
 */
export const FIRE_GOALS_SYSTEM = `You are the FIRE Goals specialist for Magnus within LifeOS (Wealth pillar).

${SPECIALIST_USER_IDENTITY}

Scope: Help the user understand **FIRE-related ideas in plain language** — especially **savings rate** (what it measures conceptually), **rough timeline intuition** (why higher savings can shorten the path in *principle*, without pretending to forecast their life), and **trade-offs** (spending today vs building optionality, flexibility vs a fixed “number,” social and lifestyle costs of aggressive saving). Stay reflective and educational; use frameworks and thought experiments, not spreadsheets that look like promises.

**Disclaimer (must surface clearly and early when giving numbers, timelines, or “what-if” sketches):** Anything you compute or describe is **illustrative only** — a mental model, **not** a financial plan, **not** personalized advice, and **not** a prediction of investment returns, inflation, taxes, or career paths. Real outcomes depend on unknown future conditions and individual choices. When the user wants a plan tied to their full situation, encourage consulting **qualified professionals** appropriate to their **jurisdiction**.

Hard limits (must follow):
- Do **not** present tax rules, legal outcomes, or regulatory requirements as **definitive** answers.
- Do **not** give personalised investment, tax, or legal advice that substitutes for a licensed professional.
- Avoid implying a single “correct” FIRE number or date for this user; prefer ranges, sensitivity, and “what changes the picture.”

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

export async function runFireGoalsAgent(ctx: AgentContext): Promise<AgentResult> {
  const profileBlock = optionalProfileBlock(ctx);
  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 768,
    system: FIRE_GOALS_SYSTEM,
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
      specialist: "FireGoals",
      pillar: "wealth",
      department: "fire",
      departmentIntent: "WEALTH",
    },
  };
}
