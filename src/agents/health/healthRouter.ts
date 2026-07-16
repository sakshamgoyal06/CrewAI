import type { AgentContext, AgentResult, DepartmentAgent } from "../types.js";
import { parseMealLogCommand } from "../../meals/parseMealLogCommand.js";
import { tryEnergyAgent } from "./energyAgent.js";
import { tryFitnessAgent } from "../../pillars/health/workouts/agents/fitnessAgent.js";
import {
  fetchUserHealthProfile,
  formatHealthPreferencesForPrompt,
} from "./healthOnboarding.js";
import { tryMealPlannerAgent } from "./mealPlannerAgent.js";
import { tryLongTermHealthPlanningAgent } from "./longTermHealthPlanningAgent.js";
import { tryAlternatesRecommenderAgent } from "./alternatesRecommenderAgent.js";
import { tryNutritionAgent } from "./nutritionAgent.js";
import { tryHevyWriteAgent } from "../../pillars/health/workouts/agents/hevyWriteAgent.js";
import { runOrchestratedMealLogTurn } from "./nutritionOrchestrated.js";
import { tryHealthJournalAgent } from "./healthJournalAgent.js";
import { loadHealthReferenceBlock } from "../../pillars/health/references/loadHealthReferences.js";

/** Short generic acknowledgement when no HEALTH sub-specialist matches the message. */
export const HEALTH_GENERIC_ACK =
  "Noted — health-related. Tell me if you want help with training, meals, or sleep and recovery, and what you’re optimizing for.";

/**
 * **Sequential first-accept (v1):** Meal planner → Long-term health planning (seasons / arcs) →
 * Fitness → Alternates (food swaps) → Nutrition → Energy.
 * Each specialist returns `null` when it does not own the message. The first non-null reply wins
 * (one response per turn). Fitness uses keyword fast-path plus `classifyHealthSubIntent` when
 * keywords are absent; Alternates matches "instead of" / "swap" / "alternative to"; Nutrition and
 * Energy use keyword patterns.
 */
function withRouterMeta(
  result: AgentResult,
  order:
    | "meal_plan"
    | "journal"
    | "long_term_health_planning"
    | "hevy_write"
    | "fitness"
    | "nutrition"
    | "energy",
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
  const { block: healthReferenceBlock } = await loadHealthReferenceBlock(ctx.userProfileId);
  const ctxWithPrefs: AgentContext = {
    ...ctx,
    healthPreferences,
    healthReferenceBlock,
  };

  const mealParsed = parseMealLogCommand(ctx.rawMessage);
  if (mealParsed.kind === "meal") {
    const r = await runOrchestratedMealLogTurn(
      ctxWithPrefs,
      mealParsed.text,
      ctx.rawMessage,
    );
    return withRouterMeta(r, "nutrition");
  }

  const journal = await tryHealthJournalAgent(ctxWithPrefs);
  if (journal) {
    return withRouterMeta(journal, "journal");
  }

  const hevyWrite = await tryHevyWriteAgent(ctxWithPrefs);
  if (hevyWrite) {
    return withRouterMeta(hevyWrite, "hevy_write");
  }

  const mealPlan = await tryMealPlannerAgent(ctxWithPrefs);
  if (mealPlan) {
    return withRouterMeta(mealPlan, "meal_plan");
  }

  const longTerm = await tryLongTermHealthPlanningAgent(ctxWithPrefs);
  if (longTerm) {
    return withRouterMeta(longTerm, "long_term_health_planning");
  }

  const fitness = await tryFitnessAgent(ctxWithPrefs);
  if (fitness) {
    return withRouterMeta(fitness, "fitness");
  }
  const alternates = await tryAlternatesRecommenderAgent(ctxWithPrefs);
  if (alternates) {
    return withRouterMeta(alternates, "nutrition");
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
