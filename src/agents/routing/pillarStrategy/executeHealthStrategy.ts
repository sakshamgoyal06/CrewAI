/**
 * Execute a parsed HEALTH pillar strategy — loads user context and runs the matching pipeline.
 */
import type { AgentContext, AgentResult } from "../../types.js";
import { parseMealLogCommand } from "../../../meals/parseMealLogCommand.js";
import { softDeleteMostRecentSession } from "../../../nutrition/store/mealHistoryStore.js";
import { tryAlternatesRecommenderAgent } from "../../health/alternatesRecommenderAgent.js";
import { tryEnergyAgent } from "../../health/energyAgent.js";
import { HEALTH_GENERIC_ACK } from "../../health/healthConstants.js";
import { tryHealthJournalAgent } from "../../health/healthJournalAgent.js";
import { executeMealHistoryCapability } from "../../health/mealHistoryAgent.js";
import { executeMealPlanReadCapability } from "../../health/mealPlanReadAgent.js";
import { executeMealPlanningCapability } from "../../health/mealPlanningAgent.js";
import { executeMealTargetCapability } from "../../health/mealTargetAgent.js";
import { tryLongTermHealthPlanningAgent } from "../../health/longTermHealthPlanningAgent.js";
import { runOrchestratedMealLogTurn } from "../../health/nutritionOrchestrated.js";
import { runNutritionCapability } from "../../health/nutritionAgent.js";
import { tryHevyWriteAgent } from "../../../pillars/health/workouts/agents/hevyWriteAgent.js";
import { runFitnessCapability } from "../../../pillars/health/workouts/agents/fitnessAgent.js";
import type { PillarStrategy } from "./types.js";
import { withPillarStrategyMeta } from "./withStrategyMeta.js";

function withStrategyMeta(
  result: AgentResult,
  strategy: PillarStrategy,
  healthOrder: string,
): AgentResult {
  return withPillarStrategyMeta(result, strategy, "pillar_strategy", {
    health_router: "pillar_strategy",
    health_order: healthOrder,
  });
}

export async function executeHealthStrategy(
  ctx: AgentContext,
  strategy: PillarStrategy,
): Promise<AgentResult> {
  const cap = strategy.capability;

  switch (cap) {
    case "meal_log_correct": {
      const correctionText =
        typeof strategy.args.correction_text === "string" && strategy.args.correction_text.trim()
          ? strategy.args.correction_text.trim()
          : ctx.rawMessage.trim();
      await softDeleteMostRecentSession(ctx.userProfileId, ctx.timezone);
      const r = await runOrchestratedMealLogTurn(ctx, correctionText, ctx.rawMessage);
      return withStrategyMeta(r, strategy, "meal_log");
    }

    case "meal_history":
    case "meal_history_undo":
    case "meal_breakdown": {
      const r = await executeMealHistoryCapability(ctx, cap);
      return withStrategyMeta(r, strategy, cap);
    }

    case "meal_targets_show":
    case "meal_targets_set": {
      const r = await executeMealTargetCapability(ctx, cap);
      return withStrategyMeta(r, strategy, "meal_targets");
    }

    case "meal_plan_create": {
      const r = await executeMealPlanningCapability(ctx);
      return withStrategyMeta(r, strategy, "meal_plan");
    }

    case "meal_plan_read":
    case "meal_plan_skip":
    case "meal_plan_swap":
    case "meal_plan_copy_week":
    case "meal_plan_template_save":
    case "meal_plan_template_apply":
    case "meal_plan_templates_list":
    case "meal_plan_shopping_list": {
      const r = await executeMealPlanReadCapability(ctx, cap, strategy.args);
      return withStrategyMeta(r, strategy, "meal_plan_read");
    }

    case "journal": {
      const r = await tryHealthJournalAgent(ctx);
      if (!r) {
        return {
          text: HEALTH_GENERIC_ACK,
          metadata: { specialist: "HealthGeneric", genericAck: true },
        };
      }
      return withStrategyMeta(r, strategy, "journal");
    }

    case "hevy_write": {
      const r = await tryHevyWriteAgent(ctx);
      if (!r) {
        return {
          text: "Use **hevy routine:** or **hevy workout:** with details.",
          metadata: { specialist: "HevyWrite", hevy_write: false },
        };
      }
      return withStrategyMeta(r, strategy, "hevy_write");
    }

    case "fitness": {
      const r = await runFitnessCapability(ctx);
      return withStrategyMeta(r, strategy, "fitness");
    }

    case "alternates": {
      const r = await tryAlternatesRecommenderAgent(ctx);
      if (!r) {
        return withStrategyMeta(await runNutritionCapability(ctx), strategy, "nutrition");
      }
      return withStrategyMeta(r, strategy, "nutrition");
    }

    case "nutrition_advice": {
      const r = await runNutritionCapability(ctx);
      return withStrategyMeta(r, strategy, "nutrition");
    }

    case "energy": {
      const r = await tryEnergyAgent(ctx);
      if (!r) {
        return {
          text: HEALTH_GENERIC_ACK,
          metadata: { specialist: "HealthGeneric", genericAck: true },
        };
      }
      return withStrategyMeta(r, strategy, "energy");
    }

    case "long_term_planning": {
      const r = await tryLongTermHealthPlanningAgent(ctx);
      if (!r) {
        return {
          text: HEALTH_GENERIC_ACK,
          metadata: { specialist: "HealthGeneric", genericAck: true },
        };
      }
      return withStrategyMeta(r, strategy, "long_term_health_planning");
    }

    default:
      return {
        text: HEALTH_GENERIC_ACK,
        metadata: {
          specialist: "HealthGeneric",
          department: "HEALTH",
          genericAck: true,
          health_router: "pillar_strategy_fallback",
          pillar_capability: cap,
        },
      };
  }
}

/** Deterministic gates before LLM parser — unambiguous entry points. */
export function healthDeterministicCapability(ctx: AgentContext): string | null {
  if (ctx.mealPhoto?.fileId) {
    return "meal_log_photo";
  }
  if (parseMealLogCommand(ctx.rawMessage).kind === "meal") {
    return "meal_log";
  }
  return null;
}
