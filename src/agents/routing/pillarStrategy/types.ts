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

/** Routing hints — structural signals + recent turn previews (no profile/memory block). */
export type RoutingHints = {
  has_meal_photo: boolean;
  /** Vision-inferred purpose when user sent a photo (null if no photo). */
  photo_purpose: string | null;
  /** Truncated vision description for parser disambiguation. */
  photo_description_preview: string | null;
  /** Item titles/names extracted from the photo (books, foods, …). */
  photo_extracted_items: string[];
  explicit_meal_log: boolean;
  active_meal_plan_session: boolean;
  meal_plan_session_step: string | null;
  active_project_session: boolean;
  project_session_step: string | null;
  active_projects: Array<{
    id: string;
    title: string;
    project_type: string;
    priority_rank: number;
  }>;
  previous_turn_intent: string | null;
  previous_turn_capability: string | null;
  previous_turn_was_meal_log: boolean;
  /** User just locked a meal plan on the previous assistant turn. */
  previous_turn_meal_plan_locked: boolean;
  /** Integration flags for parser disambiguation (no PII). */
  google_calendar_connected: boolean;
  youtube_connected: boolean;
  notion_connected: boolean;
  hevy_connected: boolean;
  zerodha_connected: boolean;
  /** Last few chat turns (truncated) so the parser can disambiguate read vs create. */
  recent_turns: Array<{ role: "user" | "assistant"; preview: string }>;
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
