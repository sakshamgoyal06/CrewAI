import { anthropic } from "../../../tools/clients.js";
import { logger } from "../../../logger.js";
import { loggableError } from "../../../util/loggableError.js";
import type { AgentContext } from "../../types.js";
import type { PillarExecutionPlan, PlanStepResult } from "./types.js";
import { pillarPlanComposeEnabled } from "./parsePillarStrategy.js";

const COMPOSE_MODEL =
  process.env.MAGNUS_PILLAR_COMPOSE_MODEL?.trim() || "claude-haiku-4-5";

function formatStepOutcomes(stepResults: PlanStepResult[]): string {
  return stepResults
    .map(
      (s, i) =>
        `### Step ${i + 1}: ${s.capability}\n${s.text.trim()}`,
    )
    .join("\n\n");
}

/**
 * Merge multi-step executor outputs into one user-facing reply (Magnus voice, Telegram-friendly).
 */
export async function composePillarPlanReply(
  ctx: AgentContext,
  _plan: PillarExecutionPlan,
  stepResults: PlanStepResult[],
): Promise<string> {
  if (stepResults.length === 0) {
    return "…";
  }
  if (stepResults.length === 1) {
    return stepResults[0]!.text;
  }

  if (!pillarPlanComposeEnabled()) {
    return stepResults.map((s) => s.text.trim()).join("\n\n---\n\n");
  }

  const system = `You compose the final Telegram reply for Magnus after sub-agents executed a multi-step plan.

Rules:
- One cohesive message in Magnus's voice — not a numbered dump of agent outputs.
- Include every material fact/action outcome from the steps (confirmations, lists, times, errors).
- Do NOT invent data not present in step outcomes.
- Plain text with **bold** sparingly; under ~350 words unless the user asked for detail.
- No "Step 1/2" headers unless the user asked for a breakdown.`;

  const userContent = [
    `Original user message:\n${ctx.rawMessage.trim()}`,
    "",
    "Step outcomes (internal — synthesize for the user):",
    formatStepOutcomes(stepResults),
  ].join("\n");

  try {
    const msg = await anthropic.messages.create({
      model: COMPOSE_MODEL,
      max_tokens: 768,
      system,
      messages: [{ role: "user", content: userContent }],
    });
    for (const block of msg.content) {
      if (block.type === "text" && block.text.trim()) {
        return block.text.trim();
      }
    }
  } catch (e) {
    logger.warn({ err: loggableError(e) }, "pillar plan compose failed; concatenating steps");
  }

  return stepResults.map((s) => s.text.trim()).join("\n\n");
}

export function formatPriorStepContext(stepResults: PlanStepResult[]): string {
  if (stepResults.length === 0) {
    return "";
  }
  return stepResults
    .map(
      (s) =>
        `[Prior step ${s.step_index + 1} — ${s.capability}]: ${s.text.trim().slice(0, 500)}`,
    )
    .join("\n");
}
