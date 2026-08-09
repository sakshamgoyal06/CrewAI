import { runPillarSpecialist } from "../../pillarSpecialist.js";
import { WISDOM_SYSTEM } from "../../wisdom/wisdomAgent.js";
import type { AgentContext, AgentResult } from "../../types.js";
import { buildStepAgentContext } from "./buildStepAgentContext.js";
import type { PillarPlanStep } from "./types.js";

export async function executeWisdomPlanStep(
  ctx: AgentContext,
  step: PillarPlanStep,
  priorContext: string,
): Promise<AgentResult> {
  const stepCtx = buildStepAgentContext(ctx, step, priorContext);
  return runPillarSpecialist({
    ctx: stepCtx,
    system: WISDOM_SYSTEM,
    specialist: "Wisdom",
    pillar: "wisdom",
  });
}
