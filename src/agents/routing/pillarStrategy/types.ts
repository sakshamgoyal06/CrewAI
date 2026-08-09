import type { Intent } from "../../../intent.js";

/** Parsed request plan — no user PII; produced by the pillar strategy parser. */
export type PillarStrategy = {
  capability: string;
  confidence: number;
  args: Record<string, unknown>;
  parser: "llm" | "deterministic";
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
