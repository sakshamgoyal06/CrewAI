/**
 * Execute a parsed WEALTH pillar plan.
 */
import type { AgentContext, AgentResult } from "../../types.js";
import { executePillarPlan } from "./executePillarPlan.js";
import type { PillarExecutionPlan } from "./types.js";

export async function executeWealthStrategy(
  ctx: AgentContext,
  plan: PillarExecutionPlan,
): Promise<AgentResult> {
  return executePillarPlan("WEALTH", ctx, plan);
}
