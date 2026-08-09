import { anthropic } from "../../../tools/clients.js";
import { logger } from "../../../logger.js";
import { loggableError } from "../../../util/loggableError.js";
import {
  formatCatalogForPrompt,
  getCapabilityCatalog,
  isValidCapability,
} from "./catalogs/index.js";
import type { PillarExecutionPlan, PillarId, PillarPlanStep, RoutingHints } from "./types.js";
import { planFromSingleCapability } from "./types.js";

const PARSER_MODEL = process.env.MAGNUS_PILLAR_STRATEGY_MODEL?.trim() || "claude-haiku-4-5";

const MAX_PLAN_STEPS = Math.min(
  Math.max(Number.parseInt(process.env.MAGNUS_PILLAR_PLAN_MAX_STEPS ?? "4", 10) || 4, 1),
  8,
);

type RawPlanJson = {
  confidence?: number;
  capability?: string;
  args?: unknown;
  steps?: unknown;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parsePlanJson(text: string): RawPlanJson | null {
  const trimmed = text.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) {
    return null;
  }
  try {
    return JSON.parse(trimmed.slice(start, end + 1)) as RawPlanJson;
  } catch {
    return null;
  }
}

function normalizeStep(raw: unknown, pillar: PillarId): PillarPlanStep | null {
  const row = asRecord(raw);
  if (!row || typeof row.capability !== "string") {
    return null;
  }
  const capability = row.capability.trim();
  if (!isValidCapability(pillar, capability)) {
    return null;
  }
  const args = asRecord(row.args) ?? {};
  const intent_summary =
    typeof row.intent_summary === "string" && row.intent_summary.trim()
      ? row.intent_summary.trim()
      : undefined;
  return { capability, args, ...(intent_summary ? { intent_summary } : {}) };
}

function normalizePlan(parsed: RawPlanJson, pillar: PillarId): PillarExecutionPlan | null {
  const confidence =
    typeof parsed.confidence === "number" && Number.isFinite(parsed.confidence)
      ? Math.min(1, Math.max(0, parsed.confidence))
      : 0.5;

  if (Array.isArray(parsed.steps) && parsed.steps.length > 0) {
    const steps: PillarPlanStep[] = [];
    for (const raw of parsed.steps.slice(0, MAX_PLAN_STEPS)) {
      const step = normalizeStep(raw, pillar);
      if (step) {
        steps.push(step);
      }
    }
    if (steps.length === 0) {
      return null;
    }
    return { steps, confidence, parser: "llm" };
  }

  if (parsed.capability && isValidCapability(pillar, parsed.capability)) {
    const args = asRecord(parsed.args) ?? {};
    return planFromSingleCapability(parsed.capability, args, confidence, "llm");
  }

  return null;
}

function buildSystemPrompt(pillar: PillarId): string {
  const catalog = getCapabilityCatalog(pillar);
  return `You are the **${pillar} request parser** for Magnus. You do NOT see user profile, meal history, or memory — only the current message and routing hints.

Your job: produce an **ordered execution plan** — one or more steps. Each step picks one capability id, optional structured args, and a short intent_summary (what this step should accomplish).

Capabilities:
${formatCatalogForPrompt(catalog)}

Rules:
- Output ONLY valid JSON, no markdown.
- "steps" is an array of 1–${MAX_PLAN_STEPS} objects: { "capability", "args", "intent_summary" }.
- Each capability MUST be from the list above.
- "confidence" is 0.0–1.0 for the whole plan.
- Single clear intent → one step. Multiple distinct actions ("and also", "then", comma-separated tool asks) → multiple steps in logical order.
- READ before WRITE when order matters (e.g. show plan, then shopping list).
- CREATE vs READ meal plans: "make/build/create/plan meals" → meal_plan_create; "show/what's planned" → meal_plan_read.
- Meal corrections after a recent log → meal_log_correct (check previous_turn_was_meal_log).
- Do NOT duplicate the same capability unless the user explicitly asked twice.

Shape:
{"confidence":0.9,"steps":[{"capability":"id","args":{},"intent_summary":"brief sub-request"}]}`;
}

function fallbackPlan(pillar: PillarId): PillarExecutionPlan {
  const defaults: Record<PillarId, string> = {
    HEALTH: "generic_ack",
    WEALTH: "coaching",
    HAPPINESS: "coaching",
    WISDOM: "coaching",
    GENERAL: "conversation",
  };
  return planFromSingleCapability(defaults[pillar], {}, 0, "deterministic");
}

/**
 * LLM parser: message + hints only — no user data. Returns an ordered execution plan.
 */
export async function parsePillarExecutionPlan(
  pillar: PillarId,
  userMessage: string,
  hints: RoutingHints,
): Promise<PillarExecutionPlan> {
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
      max_tokens: 512,
      system: buildSystemPrompt(pillar),
      messages: [{ role: "user", content: userPayload }],
    });

    for (const block of msg.content) {
      if (block.type !== "text") {
        continue;
      }
      const parsed = parsePlanJson(block.text);
      if (!parsed) {
        continue;
      }
      const plan = normalizePlan(parsed, pillar);
      if (plan) {
        return plan;
      }
    }
  } catch (e) {
    logger.warn({ err: loggableError(e), pillar }, "pillar execution plan parser failed");
  }

  return fallbackPlan(pillar);
}

/** @deprecated Use parsePillarExecutionPlan */
export const parsePillarStrategy = parsePillarExecutionPlan;

export function pillarStrategyEnabled(): boolean {
  const raw = process.env.MAGNUS_PILLAR_STRATEGY_PARSER?.trim().toLowerCase();
  if (raw === "false" || raw === "0") {
    return false;
  }
  return true;
}

export function pillarPlanComposeEnabled(): boolean {
  const raw = process.env.MAGNUS_PILLAR_PLAN_COMPOSE?.trim().toLowerCase();
  if (raw === "false" || raw === "0") {
    return false;
  }
  return true;
}
