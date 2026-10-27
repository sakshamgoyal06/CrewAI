import type { AgentResult } from "../../types.js";
import type { PillarExecutionPlan, PlanStepResult } from "./types.js";
import { primaryStep } from "./types.js";

export function withPillarPlanMeta(
  result: AgentResult,
  plan: PillarExecutionPlan,
  stepResults: PlanStepResult[],
  router: string,
  extra?: Record<string, unknown>,
): AgentResult {
  const first = primaryStep(plan);
  return {
    text: result.text,
    metadata: {
      ...result.metadata,
      pillar_router: router,
      pillar_capability: first.capability,
      pillar_plan_steps: plan.steps.map((s) => s.capability),
      pillar_plan_step_count: plan.steps.length,
      pillar_strategy_confidence: plan.confidence,
      pillar_strategy_parser: plan.parser,
      pillar_step_results: stepResults.map((s) => ({
        step_index: s.step_index,
        capability: s.capability,
        preview: s.text.slice(0, 200),
      })),
      ...extra,
    },
  };
}

/** @deprecated Use withPillarPlanMeta */
export function withPillarStrategyMeta(
  result: AgentResult,
  plan: PillarExecutionPlan,
  router: string,
  extra?: Record<string, unknown>,
): AgentResult {
  return withPillarPlanMeta(result, plan, [], router, extra);
}
