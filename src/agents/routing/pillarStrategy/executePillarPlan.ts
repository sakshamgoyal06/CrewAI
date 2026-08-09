/**
 * Orchestrate a parsed pillar execution plan: sequential step executors → composer.
 */
import type { AgentContext, AgentResult } from "../../types.js";
import {
  composePillarPlanReply,
  formatPriorStepContext,
} from "./composePillarPlanReply.js";
import { executePlanStep } from "./executePlanStep.js";
import { pillarPlanComposeEnabled } from "./parsePillarStrategy.js";
import type { PillarExecutionPlan, PillarId, PlanStepResult } from "./types.js";
import { withPillarPlanMeta } from "./withStrategyMeta.js";

export async function executePillarPlan(
  pillar: PillarId,
  ctx: AgentContext,
  plan: PillarExecutionPlan,
  extraMeta?: Record<string, unknown>,
): Promise<AgentResult> {
  const stepResults: PlanStepResult[] = [];

  for (let i = 0; i < plan.steps.length; i += 1) {
    const step = plan.steps[i]!;
    const priorContext = formatPriorStepContext(stepResults);
    const result = await executePlanStep(pillar, ctx, step, priorContext);
    stepResults.push({
      step_index: i,
      capability: step.capability,
      text: result.text,
      metadata: result.metadata ?? {},
    });
  }

  let finalText: string;
  if (plan.steps.length === 1 && !pillarPlanComposeEnabled()) {
    finalText = stepResults[0]?.text ?? "…";
  } else if (plan.steps.length === 1) {
    finalText = stepResults[0]?.text ?? "…";
  } else {
    finalText = await composePillarPlanReply(ctx, plan, stepResults);
  }

  const mergedMetadata: Record<string, unknown> = {};
  for (const s of stepResults) {
    Object.assign(mergedMetadata, s.metadata);
  }

  return withPillarPlanMeta(
    {
      text: finalText,
      metadata: {
        ...mergedMetadata,
        pillar_plan_executed: true,
      },
    },
    plan,
    stepResults,
    "pillar_plan",
    extraMeta,
  );
}
