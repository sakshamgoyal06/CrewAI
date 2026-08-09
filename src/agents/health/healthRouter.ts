import type { AgentContext, AgentResult, DepartmentAgent } from "../types.js";
import { parseMealLogCommand } from "../../meals/parseMealLogCommand.js";
import { tryEnergyAgent } from "./energyAgent.js";
import { tryFitnessAgent } from "../../pillars/health/workouts/agents/fitnessAgent.js";
import {
  fetchUserHealthProfile,
  formatHealthPreferencesForPrompt,
} from "./healthOnboarding.js";
import { tryMealPlanReadAgent } from "./mealPlanReadAgent.js";
import { tryMealPlanningAgent } from "./mealPlanningAgent.js";
import { tryMealHistoryAgent } from "./mealHistoryAgent.js";
import { tryMealTargetAgent } from "./mealTargetAgent.js";
import { tryLongTermHealthPlanningAgent } from "./longTermHealthPlanningAgent.js";
import { tryAlternatesRecommenderAgent } from "./alternatesRecommenderAgent.js";
import { tryNutritionAgent } from "./nutritionAgent.js";
import { tryHevyWriteAgent } from "../../pillars/health/workouts/agents/hevyWriteAgent.js";
import { runOrchestratedMealLogTurn, runMealPhotoLogTurn } from "./nutritionOrchestrated.js";
import { tryHealthJournalAgent } from "./healthJournalAgent.js";
import { loadHealthReferenceBlock } from "../../pillars/health/references/loadHealthReferences.js";
import { buildRoutingHints } from "../routing/pillarStrategy/buildRoutingHints.js";
import { executeHealthStrategy, healthDeterministicCapability } from "../routing/pillarStrategy/executeHealthStrategy.js";
import { parsePillarExecutionPlan, pillarStrategyEnabled } from "../routing/pillarStrategy/parsePillarStrategy.js";
import { HEALTH_GENERIC_ACK } from "./healthConstants.js";

/** @deprecated Import from healthConstants.js */
export { HEALTH_GENERIC_ACK };

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
    | "meal_log"
    | "meal_history"
    | "meal_targets"
    | "meal_plan_read"
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

  const deterministic = healthDeterministicCapability(ctxWithPrefs);
  if (deterministic === "meal_log_photo") {
    const r = await runMealPhotoLogTurn(ctxWithPrefs);
    return withRouterMeta(r, "meal_log");
  }
  if (deterministic === "meal_log") {
    const mealParsed = parseMealLogCommand(ctx.rawMessage);
    if (mealParsed.kind === "meal") {
      const r = await runOrchestratedMealLogTurn(
        ctxWithPrefs,
        mealParsed.text,
        ctx.rawMessage,
        { mealSlot: mealParsed.slot, logKind: mealParsed.logKind },
      );
      return withRouterMeta(r, "meal_log");
    }
  }

  if (pillarStrategyEnabled()) {
    const hints = await buildRoutingHints(ctxWithPrefs);
    const plan = await parsePillarExecutionPlan("HEALTH", ctx.rawMessage, hints);
    const ctxWithPlan = { ...ctxWithPrefs, pillarStrategy: plan };
    return executeHealthStrategy(ctxWithPlan, plan);
  }

  return routeHealthMessageLegacy(ctxWithPrefs);
}

/** Regex first-accept chain — used when MAGNUS_PILLAR_STRATEGY_PARSER=false. */
async function routeHealthMessageLegacy(ctxWithPrefs: AgentContext): Promise<AgentResult> {
  const mealParsed = parseMealLogCommand(ctxWithPrefs.rawMessage);
  if (ctxWithPrefs.mealPhoto?.fileId) {
    const r = await runMealPhotoLogTurn(ctxWithPrefs);
    return withRouterMeta(r, "meal_log");
  }

  if (mealParsed.kind === "meal") {
    const r = await runOrchestratedMealLogTurn(
      ctxWithPrefs,
      mealParsed.text,
      ctxWithPrefs.rawMessage,
      { mealSlot: mealParsed.slot, logKind: mealParsed.logKind },
    );
    return withRouterMeta(r, "meal_log");
  }

  const mealHistory = await tryMealHistoryAgent(ctxWithPrefs);
  if (mealHistory) {
    return withRouterMeta(mealHistory, "meal_history");
  }

  const mealTargets = await tryMealTargetAgent(ctxWithPrefs);
  if (mealTargets) {
    return withRouterMeta(mealTargets, "meal_targets");
  }

  const journal = await tryHealthJournalAgent(ctxWithPrefs);
  if (journal) {
    return withRouterMeta(journal, "journal");
  }

  const hevyWrite = await tryHevyWriteAgent(ctxWithPrefs);
  if (hevyWrite) {
    return withRouterMeta(hevyWrite, "hevy_write");
  }

  const mealPlanRead = await tryMealPlanReadAgent(ctxWithPrefs);
  if (mealPlanRead) {
    return withRouterMeta(mealPlanRead, "meal_plan_read");
  }

  const mealPlan = await tryMealPlanningAgent(ctxWithPrefs);
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
export const healthCompositeAgent: DepartmentAgent = {
  name: "HealthComposite",
  departmentId: "HEALTH",
  run: routeHealthMessage,
};
