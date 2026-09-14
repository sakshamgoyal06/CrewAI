/**
 * Execute a parsed GENERAL pillar plan — sequential Magnus steps + composer.
 */
import type { AgentContext, AgentResult } from "../../types.js";
import { buildRoutingHints } from "./buildRoutingHints.js";
import { executePillarPlan } from "./executePillarPlan.js";
import { parsePillarExecutionPlan } from "./parsePillarStrategy.js";
import type { PillarExecutionPlan } from "./types.js";

export async function executeGeneralStrategy(
  ctx: AgentContext,
  plan?: PillarExecutionPlan,
): Promise<AgentResult> {
  const hints = await buildRoutingHints(ctx);
  const resolved =
    plan ?? ctx.pillarStrategy ?? (await parsePillarExecutionPlan("GENERAL", ctx.rawMessage, hints));
  const ctxWithPlan = { ...ctx, pillarStrategy: resolved };

  return executePillarPlan("GENERAL", ctxWithPlan, resolved, {
    magnus_plan: true,
  });
}
