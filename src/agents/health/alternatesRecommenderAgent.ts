import type { Message } from "@anthropic-ai/sdk/resources/messages/messages.js";

import { anthropic } from "../../tools/clients.js";
import { augmentUserWithMemory } from "../memory/memoryAgent.js";
import { SPECIALIST_USER_IDENTITY } from "../promptIdentity.js";
import type { AgentContext, AgentResult } from "../types.js";
import { HEALTH_SPECIALIST_MODEL } from "./model.js";

/**
 * Light classifier: food substitution / swap intent.
 * Engage when the user asks for an alternative; otherwise callers should skip this specialist.
 */
export const ALTERNATES_INTENT_PATTERN =
  /\b(instead\s+of|swap|alternative\s+to)\b/i;

export function matchesAlternatesIntent(rawMessage: string): boolean {
  return ALTERNATES_INTENT_PATTERN.test(rawMessage);
}

function textFromMessage(msg: Message): string {
  for (const block of msg.content) {
    if (block.type === "text") {
      return block.text;
    }
  }
  return "";
}

export const ALTERNATES_RECOMMENDER_SYSTEM = `You are the **Alternates Recommender** specialist for Magnus within LifeOS.

${SPECIALIST_USER_IDENTITY}

Scope: **Food substitutions** when the user wants something **instead of** an ingredient or food — for **dietary constraints** (e.g. vegan, keto, low FODMAP), **allergies or intolerances** (treat stated allergens as strict exclusions), or **macro targets** (e.g. more protein, fewer carbs). This is **not** meal logging, parsing, or calorie journaling; do not format replies like a food log.

**Reply style:** Offer **2–4** concrete alternatives when possible, each with one short line on why it works (texture, cooking behavior, or nutrition). If critical context is missing (e.g. which allergy, or the dish), ask **one** clarifying question first, then suggest options.

**Safety:** You are not a doctor or registered dietitian. For medical nutrition therapy or diagnosed conditions, encourage appropriate professional care. Never minimize allergy risk.

LifeOS: supportive tone, no shame; keep replies under ~220 words unless they ask for more.`;

/**
 * Runs the alternates recommender (call after `matchesAlternatesIntent` is true).
 */
export async function runAlternatesRecommenderAgent(ctx: AgentContext): Promise<AgentResult> {
  const userBlock = augmentUserWithMemory(
    `${ctx.rawMessage}${ctx.healthPreferences ?? ""}`,
    ctx.memoryBlock,
  );
  const msg = await anthropic.messages.create({
    model: HEALTH_SPECIALIST_MODEL,
    max_tokens: 896,
    system: ALTERNATES_RECOMMENDER_SYSTEM,
    messages: [{ role: "user", content: userBlock }],
  });
  const text = textFromMessage(msg).trim() || "…";
  return {
    text,
    metadata: {
      specialist: "AlternatesRecommender",
      department: "nutrition",
    },
  };
}

/** Used by healthRouter after Fitness, before general Nutrition. Returns null when keywords do not match. */
export async function tryAlternatesRecommenderAgent(ctx: AgentContext): Promise<AgentResult | null> {
  if (!matchesAlternatesIntent(ctx.rawMessage)) {
    return null;
  }
  return runAlternatesRecommenderAgent(ctx);
}
