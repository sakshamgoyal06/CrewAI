/**
 * Execute a parsed GENERAL pillar plan — sequential Magnus steps + composer.
 */
import type { AgentContext, AgentResult } from "../../types.js";
import { buildRoutingHints } from "./buildRoutingHints.js";
import { executePillarPlan } from "./executePillarPlan.js";
import { parsePillarExecutionPlan } from "./parsePillarStrategy.js";
import { planFromSingleCapability, type PillarExecutionPlan } from "./types.js";

export async function executeGeneralStrategy(
  ctx: AgentContext,
  plan?: PillarExecutionPlan,
): Promise<AgentResult> {
  const hints = await buildRoutingHints(ctx);
  const journalNotePlan =
    ctx.routingContext?.looks_like_journal_note === true
      ? planFromSingleCapability("journal_note", {}, 1, "deterministic")
      : null;
  const resolved =
    plan ??
    ctx.pillarStrategy ??
    journalNotePlan ??
    (await parsePillarExecutionPlan("GENERAL", ctx.rawMessage, hints));
  const ctxWithPlan = { ...ctx, pillarStrategy: resolved };

  return executePillarPlan("GENERAL", ctxWithPlan, resolved, {
    magnus_plan: true,
  });
}
