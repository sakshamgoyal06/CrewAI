/**
 * Execute a parsed HAPPINESS pillar plan.
 */
import type { AgentContext, AgentResult } from "../../types.js";
import { executePillarPlan } from "./executePillarPlan.js";
import type { PillarExecutionPlan } from "./types.js";

export async function executeHappinessStrategy(
  ctx: AgentContext,
  plan: PillarExecutionPlan,
): Promise<AgentResult> {
  return executePillarPlan("HAPPINESS", ctx, plan);
}
