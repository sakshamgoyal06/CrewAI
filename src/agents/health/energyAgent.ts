import type { Message } from "@anthropic-ai/sdk/resources/messages/messages.js";

import { anthropic } from "../../tools/clients.js";
import { augmentUserWithMemory } from "../memory/memoryAgent.js";
import type { AgentContext, AgentResult } from "../types.js";
import { HEALTH_SPECIALIST_MODEL } from "./model.js";

/**
 * Roster §6.3 — Energy (sleep / HRV / focus correlations; not medical diagnosis).
 */
export const ENERGY_SYSTEM = `You are the Energy agent for Magnus. You discuss sleep, perceived energy, HRV-style signals, focus, caffeine habits, and burnout patterns as **non-clinical correlations and recovery ideas** — not diagnosis or treatment.

Rules:
- Offer practical correlations (e.g. sleep timing vs. focus) and gentle recovery suggestions; stay concise.
- You are **not** a doctor or clinician. Do not diagnose conditions or prescribe medication.
- If the user describes urgent or severe symptoms, chest pain, fainting, suicidal thoughts, or anything that sounds like an emergency, tell them to **seek professional or emergency care** and do not try to replace that.
- No medical claims; frame insights as patterns and self-observation, not guarantees.`;

const ENERGY_PATTERN =
  /\b(sleep|sleeping|slept|insomnia|tired|tiredness|fatigue|fatigued|exhausted|hrv|heart\s+rate\s+variability|caffeine|coffee|espresso|burnout|burned\s+out|nap|naps|circadian|drowsy|sleepiness|sleep\s+quality|wake\s+up|woke|wakefulness|melatonin|rest\s+day|brain\s+fog|focus\b|attention\b|stimulants?|overwork|depleted|recovery\b|screen\s+time\s+before\s+bed|blue\s+light)\b/i;

const ENERGY_PHRASE_PATTERN =
  /\b(low\s+energy|energy\s+crash|energy\s+levels|no\s+energy|can't\s+sleep|cannot\s+sleep|trouble\s+sleeping|poor\s+sleep|bad\s+sleep|sleep\s+debt|sleep\s+schedule)\b/i;

export function matchesEnergyMessage(rawMessage: string): boolean {
  return ENERGY_PATTERN.test(rawMessage) || ENERGY_PHRASE_PATTERN.test(rawMessage);
}

function textFromMessage(msg: Message): string {
  for (const block of msg.content) {
    if (block.type === "text") {
      return block.text;
    }
  }
  return "";
}

export async function tryEnergyAgent(ctx: AgentContext): Promise<AgentResult | null> {
  if (!matchesEnergyMessage(ctx.rawMessage)) {
    return null;
  }
  const msg = await anthropic.messages.create({
    model: HEALTH_SPECIALIST_MODEL,
    max_tokens: 512,
    system: ENERGY_SYSTEM,
    messages: [
      {
        role: "user",
        content: augmentUserWithMemory(
          `${ctx.rawMessage}${ctx.healthPreferences ?? ""}`,
          ctx.memoryBlock,
        ),
      },
    ],
  });
  const text = textFromMessage(msg).trim() || "…";
  return {
    text,
    metadata: { specialist: "Energy", department: "HEALTH" },
  };
}
