/**
 * Execute one GENERAL plan step — Magnus with capability-filtered tools.
 */
import { runMagnusAgent } from "../../magnusAgent.js";
import type { AgentContext, AgentResult } from "../../types.js";
import { GENERAL_CAPABILITY_TOOLS } from "./catalogs/generalCatalog.js";
import { buildStepAgentContext } from "./buildStepAgentContext.js";
import type { PillarPlanStep } from "./types.js";

export async function executeGeneralPlanStep(
  ctx: AgentContext,
  step: PillarPlanStep,
  priorContext: string,
): Promise<AgentResult> {
  const stepCtx = buildStepAgentContext(ctx, step, priorContext);
  const allowedToolNames =
    GENERAL_CAPABILITY_TOOLS[step.capability] ?? GENERAL_CAPABILITY_TOOLS.conversation ?? [];

  return runMagnusAgent(stepCtx, {
    allowedToolNames,
    originalUserMessage: ctx.rawMessage,
  });
}
