import { HAPPINESS_SYSTEM } from "../../happiness/happinessAgent.js";
import { runPillarSpecialist } from "../../pillarSpecialist.js";
import type { AgentContext, AgentResult } from "../../types.js";
import { buildStepAgentContext } from "./buildStepAgentContext.js";
import type { PillarPlanStep } from "./types.js";

export async function executeHappinessPlanStep(
  ctx: AgentContext,
  step: PillarPlanStep,
  priorContext: string,
): Promise<AgentResult> {
  const stepCtx = buildStepAgentContext(ctx, step, priorContext);
  return runPillarSpecialist({
    ctx: stepCtx,
    system: HAPPINESS_SYSTEM,
    specialist: "Happiness",
    pillar: "joy",
    agent: "HAPPINESS",
    capability: step.capability,
    enableOpsTools: true,
  });
}
