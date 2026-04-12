import type { AgentContext, AgentResult, DepartmentAgent } from "../types.js";
import { tryEnergyAgent } from "./energyAgent.js";
import { tryFitnessAgent } from "./fitnessAgent.js";
import {
  fetchUserHealthProfile,
  formatHealthPreferencesForPrompt,
} from "./healthOnboarding.js";
import { tryNutritionAgent } from "./nutritionAgent.js";

/** Short generic acknowledgement when no HEALTH sub-specialist matches the message. */
export const HEALTH_GENERIC_ACK =
  "Noted — health-related. Tell me if you want help with training, meals, or sleep and recovery, and what you’re optimizing for.";

/**
 * **Sequential first-accept (v1):** Fitness → Nutrition → Energy.
 * Each specialist returns `null` when it does not own the message. The first non-null reply wins
 * (one response per turn). Fitness uses keyword fast-path plus `classifyHealthSubIntent` when
 * keywords are absent; Nutrition and Energy use keyword patterns.
 */
function withRouterMeta(
  result: AgentResult,
  order: "fitness" | "nutrition" | "energy",
): AgentResult {
  return {
    text: result.text,
    metadata: {
      ...(result.metadata ?? {}),
      health_router: "first_accept",
      health_order: order,
    },
  };
}

export async function routeHealthMessage(ctx: AgentContext): Promise<AgentResult> {
  const healthRow = await fetchUserHealthProfile(ctx.userProfileId);
  const healthPreferences = formatHealthPreferencesForPrompt(healthRow);
  const ctxWithPrefs: AgentContext = { ...ctx, healthPreferences };

  const fitness = await tryFitnessAgent(ctxWithPrefs);
  if (fitness) {
    return withRouterMeta(fitness, "fitness");
  }
  const nutrition = await tryNutritionAgent(ctxWithPrefs);
  if (nutrition) {
    return withRouterMeta(nutrition, "nutrition");
  }
  const energy = await tryEnergyAgent(ctxWithPrefs);
  if (energy) {
    return withRouterMeta(energy, "energy");
  }
  return {
    text: HEALTH_GENERIC_ACK,
    metadata: {
      specialist: "HealthGeneric",
      department: "HEALTH",
      genericAck: true,
      health_router: "fallback",
    },
  };
}

/** Single HEALTH entrypoint for `registry.ts` — name matches orchestrator tests. */
export const healthCompositeAgent: DepartmentAgent = {
  name: "HealthComposite",
  departmentId: "HEALTH",
  run: routeHealthMessage,
};
