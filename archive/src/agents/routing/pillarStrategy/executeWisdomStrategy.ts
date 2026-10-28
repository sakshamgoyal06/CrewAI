/**
 * Execute a parsed WISDOM pillar plan.
 */
import type { AgentContext, AgentResult } from "../../types.js";
import { executePillarPlan } from "./executePillarPlan.js";
import type { PillarExecutionPlan } from "./types.js";

export async function executeWisdomStrategy(
  ctx: AgentContext,
  plan: PillarExecutionPlan,
): Promise<AgentResult> {
  return executePillarPlan("WISDOM", ctx, plan);
}
