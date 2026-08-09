/**
 * Execute a parsed HEALTH pillar plan — sequential steps + composer.
 */
export { executeHealthPlanStep } from "./executeHealthPlanStep.js";
export { healthDeterministicCapability } from "./healthDeterministicGates.js";

import type { AgentContext, AgentResult } from "../../types.js";
import { executePillarPlan } from "./executePillarPlan.js";
import type { PillarExecutionPlan } from "./types.js";

export async function executeHealthStrategy(
  ctx: AgentContext,
  plan: PillarExecutionPlan,
): Promise<AgentResult> {
  const result = await executePillarPlan("HEALTH", ctx, plan, {
    health_router: "pillar_plan",
    health_order: plan.steps[0]?.capability ?? "generic_ack",
  });
  return result;
}
