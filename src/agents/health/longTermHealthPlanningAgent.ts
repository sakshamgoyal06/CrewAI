import type { Message } from "@anthropic-ai/sdk/resources/messages/messages.js";

import { anthropic } from "../../tools/clients.js";
import { buildAgentMessages } from "../memory/memoryAgent.js";
import { buildSpecialistIdentity } from "../promptIdentity.js";
import type { AgentContext, AgentResult } from "../types.js";
import { HEALTH_SPECIALIST_MODEL } from "./model.js";

/**
 * Long-horizon training and habit planning — seasonal arcs, conceptual race prep, multi-month
 * routines. Supportive, non-clinical; not diagnosis or treatment.
 */
export const LONG_TERM_HEALTH_PLANNING_SYSTEM = `You are the Long-Term Health Planning specialist for Magnus (Health pillar).

**Scope:** Help the user think in **seasons and phases** — training arcs, multi-week or multi-month blocks, conceptual race or event prep (timing, priorities, recovery emphasis — not a medical plan), and **sustainable habits** that play out over months. You may outline sensible periodization ideas, trade-offs, and how to sequence focus (e.g. base → build → sharpen) in plain language.

**Rules:**
- You are **not** a clinician. Do **not** diagnose, treat, or interpret symptoms as medical conditions. Frame everything as **general planning and lifestyle organization**, not medical advice.
- Avoid definitive claims about performance or health outcomes; use cautious language (e.g. "often", "one approach", "worth discussing with a coach or care team if you have concerns").
- If the user describes **acute injury, chest pain, fainting, or emergency-level symptoms**, tell them to **seek appropriate professional or emergency care** and keep your reply minimal.
- LifeOS: supportive tone, no shame; at most **one** clear next step unless they ask for more. Default under ~220 words unless they want detail.`;

/** Horizons and calendars (multi-week / seasonal language). */
const LONG_TERM_HORIZON_RE =
  /\b(?:\d+\s*(?:week|weeks|month|months)|multi-?month|half-?year|quarter|season|seasonal|next\s+season|long-?term|over\s+the\s+next\s+(?:few\s+)?(?:week|weeks|month|months)|months?\s+ahead|rolling\s+(?:quarter|season))\b/i;

/** Structure: periodization, phases, arcs, conceptual race prep. */
const LONG_TERM_STRUCTURE_RE =
  /\b(?:periodiz(?:e|ing|ation)|mesocycle|macrocycle|microcycle|training\s+arc|season\s+plan|race\s+prep|race\s+calendar|goal\s+race|base\s+phase|build\s+phase|peak\s+phase|taper(?:ing)?|training\s+block|block\s+training|habit\s+(?:arc|stack)|(?:12|16|20|24)(?:\s*|-\s*)week|90\s*day)\b/i;

const LONG_TERM_EVENT_RE =
  /\b(?:marathon|half\s+marathon|triathlon|ultra|5k|10k|trail\s+race|sportive|century\s+ride)\b/i;

/**
 * True when the message is about multi-month / seasonal training or habit planning (vs a single session).
 */
export function matchesLongTermHealthPlanningMessage(rawMessage: string): boolean {
  const h = LONG_TERM_HORIZON_RE.test(rawMessage);
  const s = LONG_TERM_STRUCTURE_RE.test(rawMessage);
  if (s) {
    return true;
  }
  if (h && LONG_TERM_EVENT_RE.test(rawMessage)) {
    return true;
  }
  if (h && /\b(?:training\s+plan|build\s+up|ramp\s+up|prep(?:ping)?\s+for)\b/i.test(rawMessage)) {
    return true;
  }
  return false;
}

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

export async function tryLongTermHealthPlanningAgent(
  ctx: AgentContext,
): Promise<AgentResult | null> {
  if (!matchesLongTermHealthPlanningMessage(ctx.rawMessage)) {
    return null;
  }

  const prefs = ctx.healthPreferences?.trim()
    ? `\n\nHealth preferences (onboarding): ${ctx.healthPreferences.trim()}`
    : "";
  const profileBlock = optionalProfileBlock(ctx);
  const msg = await anthropic.messages.create({
    model: HEALTH_SPECIALIST_MODEL,
    max_tokens: 896,
    system: `${buildSpecialistIdentity(ctx)}\n\n${LONG_TERM_HEALTH_PLANNING_SYSTEM}`,
    messages: buildAgentMessages(ctx, `${ctx.rawMessage}${prefs}${profileBlock}`),
  });
  const text = textFromMessage(msg).trim() || "…";
  return {
    text,
    metadata: {
      specialist: "LongTermHealthPlanning",
      department: "long_term_health_planning",
      pillar: "health",
    },
  };
}
