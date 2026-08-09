import type { AgentContext } from "../../types.js";
import type { PillarPlanStep } from "./types.js";

/** Build agent context for one plan step — keep original user message + optional step focus. */
export function buildStepAgentContext(
  ctx: AgentContext,
  step: PillarPlanStep,
  priorContext: string,
): AgentContext {
  const original = ctx.originalUserMessage?.trim() || ctx.rawMessage.trim();
  const focus = step.intent_summary?.trim();

  let rawMessage: string;
  if (priorContext) {
    rawMessage = `${focus ?? original}\n\n---\nPrior steps completed:\n${priorContext}`;
  } else if (focus && focus !== original) {
    rawMessage = `${original}\n\n---\nStep focus: ${focus}`;
  } else {
    rawMessage = original;
  }

  return {
    ...ctx,
    rawMessage,
    originalUserMessage: original,
  };
}
