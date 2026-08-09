import { anthropic } from "../../../tools/clients.js";
import { logger } from "../../../logger.js";
import { loggableError } from "../../../util/loggableError.js";
import {
  formatCatalogForPrompt,
  getCapabilityCatalog,
  isValidCapability,
} from "./catalogs/index.js";
import type { PillarId, PillarStrategy, RoutingHints } from "./types.js";

const PARSER_MODEL = process.env.MAGNUS_PILLAR_STRATEGY_MODEL?.trim() || "claude-haiku-4-5";

function parseStrategyJson(text: string): { capability?: string; confidence?: number; args?: unknown } | null {
  const trimmed = text.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) {
    return null;
  }
  try {
    return JSON.parse(trimmed.slice(start, end + 1)) as {
      capability?: string;
      confidence?: number;
      args?: unknown;
    };
  } catch {
    return null;
  }
}

function buildSystemPrompt(pillar: PillarId): string {
  const catalog = getCapabilityCatalog(pillar);
  return `You are the **${pillar} request parser** for Magnus. You do NOT see user profile, meal history, or memory — only the current message and routing hints.

Your job: pick exactly ONE capability id and extract structured args for the executor.

Capabilities:
${formatCatalogForPrompt(catalog)}

Rules:
- Output ONLY valid JSON, no markdown.
- "capability" MUST be one of the ids listed above.
- "confidence" is 0.0–1.0.
- "args" is an object with extracted parameters (horizon_hint, date_hint, correction_text, topic, etc.) — empty {} if none.
- Prefer the most specific capability. Do NOT pick generic_ack unless nothing else fits.
- CREATE vs READ meal plans: "make/build/create/plan meals" → meal_plan_create; "show/what's planned" → meal_plan_read.
- Meal corrections after a recent log → meal_log_correct (check previous_turn_was_meal_log).
- List/YouTube/calendar actions → if pillar is not GENERAL, still pick the best HEALTH/WEALTH/etc. capability; cross-pillar tool actions should not happen here.

Shape:
{"capability":"id","confidence":0.95,"args":{}}`;
}

function fallbackStrategy(pillar: PillarId): PillarStrategy {
  const defaults: Record<PillarId, string> = {
    HEALTH: "generic_ack",
    WEALTH: "coaching",
    HAPPINESS: "coaching",
    WISDOM: "coaching",
    GENERAL: "conversation",
  };
  return {
    capability: defaults[pillar],
    confidence: 0,
    args: {},
    parser: "deterministic",
  };
}

/**
 * LLM parser: message + hints only — no user data. Returns capability + args for executor.
 */
export async function parsePillarStrategy(
  pillar: PillarId,
  userMessage: string,
  hints: RoutingHints,
): Promise<PillarStrategy> {
  const userPayload = JSON.stringify(
    {
      message: userMessage.trim(),
      routing_hints: hints,
    },
    null,
    2,
  );

  try {
    const msg = await anthropic.messages.create({
      model: PARSER_MODEL,
      max_tokens: 256,
      system: buildSystemPrompt(pillar),
      messages: [{ role: "user", content: userPayload }],
    });

    for (const block of msg.content) {
      if (block.type !== "text") {
        continue;
      }
      const parsed = parseStrategyJson(block.text);
      if (!parsed?.capability || !isValidCapability(pillar, parsed.capability)) {
        continue;
      }
      const confidence =
        typeof parsed.confidence === "number" && Number.isFinite(parsed.confidence)
          ? Math.min(1, Math.max(0, parsed.confidence))
          : 0.5;
      const args =
        parsed.args && typeof parsed.args === "object" && !Array.isArray(parsed.args)
          ? (parsed.args as Record<string, unknown>)
          : {};
      return {
        capability: parsed.capability,
        confidence,
        args,
        parser: "llm",
      };
    }
  } catch (e) {
    logger.warn({ err: loggableError(e), pillar }, "pillar strategy parser failed");
  }

  return fallbackStrategy(pillar);
}

export function pillarStrategyEnabled(): boolean {
  const raw = process.env.MAGNUS_PILLAR_STRATEGY_PARSER?.trim().toLowerCase();
  if (raw === "false" || raw === "0") {
    return false;
  }
  return true;
}
