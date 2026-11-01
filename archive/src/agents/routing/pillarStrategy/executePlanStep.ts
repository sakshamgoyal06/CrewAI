/**
 * Run one plan step for the given pillar.
 */
import type { AgentContext, AgentResult } from "../../types.js";
import { executeGeneralPlanStep } from "./executeGeneralPlanStep.js";
import { executeHappinessPlanStep } from "./executeHappinessPlanStep.js";
import { executeHealthPlanStep } from "./executeHealthPlanStep.js";
import { executeWealthPlanStep } from "./executeWealthPlanStep.js";
import { executeWisdomPlanStep } from "./executeWisdomPlanStep.js";
import type { PillarId, PillarPlanStep } from "./types.js";

export async function executePlanStep(
  pillar: PillarId,
  ctx: AgentContext,
  step: PillarPlanStep,
  priorContext: string,
): Promise<AgentResult> {
  switch (pillar) {
    case "HEALTH":
      return executeHealthPlanStep(ctx, step, priorContext);
    case "WEALTH":
      return executeWealthPlanStep(ctx, step, priorContext);
    case "HAPPINESS":
      return executeHappinessPlanStep(ctx, step, priorContext);
    case "WISDOM":
      return executeWisdomPlanStep(ctx, step, priorContext);
    case "GENERAL":
      return executeGeneralPlanStep(ctx, step, priorContext);
    default:
      return executeGeneralPlanStep(ctx, step, priorContext);
  }
}
