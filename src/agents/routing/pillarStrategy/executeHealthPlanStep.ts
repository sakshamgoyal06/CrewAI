/**
 * Execute one HEALTH plan step — loads user context and runs the matching pipeline.
 */
import type { AgentContext, AgentResult } from "../../types.js";
import { softDeleteMostRecentSession } from "../../../nutrition/store/mealHistoryStore.js";
import { runAlternatesRecommenderAgent } from "../../health/alternatesRecommenderAgent.js";
import { runEnergyAgent } from "../../health/energyAgent.js";
import { HEALTH_GENERIC_ACK } from "../../health/healthConstants.js";
import { runHealthJournalAgent } from "../../health/healthJournalAgent.js";
import { executeMealHistoryCapability } from "../../health/mealHistoryAgent.js";
import { executeMealPlanReadCapability } from "../../health/mealPlanReadAgent.js";
import { executeMealPlanningCapability } from "../../health/mealPlanningAgent.js";
import { executeMealTargetCapability } from "../../health/mealTargetAgent.js";
import { runLongTermHealthPlanningAgent } from "../../health/longTermHealthPlanningAgent.js";
import {
  runMealPhotoLogTurn,
  runOrchestratedMealLogTurn,
} from "../../health/nutritionOrchestrated.js";
import { runNutritionCapability } from "../../health/nutritionAgent.js";
import { tryHevyWriteAgent } from "../../../pillars/health/workouts/agents/hevyWriteAgent.js";
import { parseMealLogCommand } from "../../../meals/parseMealLogCommand.js";
import { sanitizeMealLogRawText } from "../../../meals/sanitizeMealLogRawText.js";
import { runFitnessCapability } from "../../../pillars/health/workouts/agents/fitnessAgent.js";
import type { PillarPlanStep } from "./types.js";
import { buildStepAgentContext } from "./buildStepAgentContext.js";

export async function executeHealthPlanStep(
  ctx: AgentContext,
  step: PillarPlanStep,
  priorContext: string,
): Promise<AgentResult> {
  const stepCtx = buildStepAgentContext(ctx, step, priorContext);
  const cap = step.capability;

  switch (cap) {
    case "meal_log": {
      const original = ctx.originalUserMessage?.trim() || ctx.rawMessage.trim();
      const mealParsed = parseMealLogCommand(stepCtx.rawMessage);
      const rawText =
        mealParsed.kind === "meal"
          ? mealParsed.text
          : typeof step.args.meal_text === "string" && step.args.meal_text.trim()
            ? step.args.meal_text.trim()
            : typeof step.intent_summary === "string" && step.intent_summary.trim()
              ? step.intent_summary.trim()
              : stepCtx.rawMessage.trim();
      return runOrchestratedMealLogTurn(
        stepCtx,
        sanitizeMealLogRawText(rawText),
        original,
        {
          mealSlot: mealParsed.kind === "meal" ? mealParsed.slot : undefined,
          logKind: mealParsed.kind === "meal" ? mealParsed.logKind : undefined,
        },
      );
    }

    case "meal_log_photo":
      return runMealPhotoLogTurn(stepCtx);

    case "meal_log_correct": {
      const correctionText =
        typeof step.args.correction_text === "string" && step.args.correction_text.trim()
          ? step.args.correction_text.trim()
          : stepCtx.rawMessage.trim();
      await softDeleteMostRecentSession(stepCtx.userProfileId, stepCtx.timezone);
      return runOrchestratedMealLogTurn(stepCtx, correctionText, ctx.rawMessage);
    }

    case "meal_history":
    case "meal_history_undo":
    case "meal_breakdown":
      return executeMealHistoryCapability(stepCtx, cap);

    case "meal_targets_show":
    case "meal_targets_set":
      return executeMealTargetCapability(stepCtx, cap);

    case "meal_plan_create":
      return executeMealPlanningCapability(stepCtx);

    case "meal_plan_read":
    case "meal_plan_skip":
    case "meal_plan_swap":
    case "meal_plan_copy_week":
    case "meal_plan_template_save":
    case "meal_plan_template_apply":
    case "meal_plan_templates_list":
    case "meal_plan_shopping_list":
      return executeMealPlanReadCapability(stepCtx, cap, step.args);

    case "journal":
      return runHealthJournalAgent(stepCtx);

    case "hevy_write": {
      const r = await tryHevyWriteAgent(stepCtx);
      return (
        r ?? {
          text: "Use **hevy routine:** or **hevy workout:** with details.",
          metadata: { specialist: "HevyWrite", hevy_write: false },
        }
      );
    }

    case "fitness":
      return runFitnessCapability(stepCtx);

    case "alternates":
      return runAlternatesRecommenderAgent(stepCtx);

    case "nutrition_advice":
      return runNutritionCapability(stepCtx);

    case "energy":
      return runEnergyAgent(stepCtx);

    case "long_term_planning":
      return runLongTermHealthPlanningAgent(stepCtx);

    default:
      return {
        text: HEALTH_GENERIC_ACK,
        metadata: {
          specialist: "HealthGeneric",
          department: "HEALTH",
          genericAck: true,
          health_router: "pillar_plan_fallback",
          pillar_capability: cap,
        },
      };
  }
}
