import type { AgentContext } from "../../types.js";
import type { PillarPlanStep } from "./types.js";

/** Build agent context for one plan step — focused message + prior step outcomes. */
export function buildStepAgentContext(
  ctx: AgentContext,
  step: PillarPlanStep,
  priorContext: string,
): AgentContext {
  const focus = step.intent_summary?.trim() || ctx.rawMessage.trim();
  const rawMessage = priorContext
    ? `${focus}\n\n---\nPrior steps completed:\n${priorContext}`
    : focus;

  return {
    ...ctx,
    rawMessage,
  };
}
