import type { Intent } from "../../../intent.js";

/** One step in a pillar execution plan — produced by the parser, no user PII. */
export type PillarPlanStep = {
  capability: string;
  args: Record<string, unknown>;
  /** Brief sub-request for the step executor (no profile/memory). */
  intent_summary?: string;
};

/** Ordered plan from parser → sequential step executors → composer. */
export type PillarExecutionPlan = {
  steps: PillarPlanStep[];
  confidence: number;
  parser: "llm" | "deterministic";
};

/** @deprecated Alias — strategy is now a multi-step plan. */
export type PillarStrategy = PillarExecutionPlan;

export type PlanStepResult = {
  step_index: number;
  capability: string;
  text: string;
  metadata: Record<string, unknown>;
};

/** Routing hints only — no profile, memory, or DB contents. */
export type RoutingHints = {
  has_meal_photo: boolean;
  explicit_meal_log: boolean;
  active_meal_plan_session: boolean;
  meal_plan_session_step: string | null;
  previous_turn_intent: string | null;
  previous_turn_capability: string | null;
  previous_turn_was_meal_log: boolean;
};

export type PillarId = Intent;

export type CapabilityCatalogEntry = {
  id: string;
  summary: string;
  /** When to pick this vs similar capabilities. */
  disambiguation: string;
};

export type CapabilityCatalog = {
  pillar: PillarId;
  capabilities: CapabilityCatalogEntry[];
};

export function primaryStep(plan: PillarExecutionPlan): PillarPlanStep {
  return (
    plan.steps[0] ?? {
      capability: "conversation",
      args: {},
    }
  );
}

export function planFromSingleCapability(
  capability: string,
  args: Record<string, unknown>,
  confidence: number,
  parser: "llm" | "deterministic",
): PillarExecutionPlan {
  return {
    steps: [{ capability, args }],
    confidence,
    parser,
  };
}
