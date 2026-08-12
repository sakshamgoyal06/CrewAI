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
import { parseMealLogCommand, type MealLogKind, type MealSlot } from "../../../meals/parseMealLogCommand.js";
import { sanitizeMealLogRawText } from "../../../meals/sanitizeMealLogRawText.js";
import { isMealPlanningIntent, isMealSlotCorrectionMessage, extractPastMealFoodText, extractMealSlotFromMessage, inferMealLogCandidate, normalizeMealLogText } from "../../../meals/mealLogIntent.js";
import {
  clearMealLogPending,
  formatMealLogConfirmationPrompt,
  getMealLogPending,
  isMealLogConfirmationNo,
  isMealLogConfirmationYes,
  setMealLogPending,
} from "../../../meals/mealLogPending.js";
import { localDateKey } from "../../../nutrition/localDate.js";
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

      const pending = await getMealLogPending(ctx.userProfileId);
      if (pending) {
        if (isMealLogConfirmationYes(original)) {
          await clearMealLogPending(ctx.userProfileId);
          return runOrchestratedMealLogTurn(
            stepCtx,
            sanitizeMealLogRawText(pending.rawText),
            pending.originalMessage,
            {
              mealSlot: pending.mealSlot,
              logKind: pending.logKind,
            },
          );
        }
        if (isMealLogConfirmationNo(original)) {
          await clearMealLogPending(ctx.userProfileId);
          return {
            text: "Okay — I won't log that meal.",
            metadata: {
              specialist: "nutrition",
              department: "HEALTH",
              meal_log: false,
              meal_log_pending_cancelled: true,
              pillar_compose: false,
            },
          };
        }
        await clearMealLogPending(ctx.userProfileId);
      }

      if (isMealPlanningIntent(original)) {
        return {
          text: "That sounds like a **meal plan** (future meals), not food you've eaten yet. Say what you **ate** to log it, or ask to see your **meal plan**.",
          metadata: {
            specialist: "nutrition",
            department: "HEALTH",
            meal_log: false,
            meal_planning_blocked: true,
            pillar_compose: false,
          },
        };
      }
      const mealParsed = parseMealLogCommand(stepCtx.rawMessage);
      const rawCandidate =
        extractPastMealFoodText(original) ??
        (mealParsed.kind === "meal"
          ? mealParsed.text
          : typeof step.args.meal_text === "string" && step.args.meal_text.trim()
            ? step.args.meal_text.trim()
            : typeof step.intent_summary === "string" && step.intent_summary.trim()
              ? step.intent_summary.trim()
              : stepCtx.rawMessage.trim());
      const rawText = normalizeMealLogText(rawCandidate);
      if (!rawText) {
        const candidate = inferMealLogCandidate(original);
        if (candidate) {
          const mealSlot =
            mealParsed.kind === "meal"
              ? mealParsed.slot
              : candidate.mealSlot ?? extractMealSlotFromMessage(original);
          await setMealLogPending(ctx.userProfileId, {
            rawText: candidate.foodText,
            originalMessage: original,
            mealSlot: mealSlot !== "unspecified" ? mealSlot : candidate.mealSlot,
            logKind: mealParsed.kind === "meal" ? mealParsed.logKind : undefined,
          });
          return {
            text: formatMealLogConfirmationPrompt({
              foodText: candidate.foodText,
              mealSlot: mealSlot !== "unspecified" ? mealSlot : candidate.mealSlot,
            }),
            metadata: {
              specialist: "nutrition",
              department: "HEALTH",
              meal_log: false,
              meal_log_pending: true,
              pillar_compose: false,
            },
          };
        }
        return {
          text: "I couldn't log that — it didn't look like food you ate. Tell me what you **had** (e.g. \"I ate a samosa and tea\").",
          metadata: {
            specialist: "nutrition",
            department: "HEALTH",
            meal_log: false,
            meal_log_rejected: true,
            pillar_compose: false,
          },
        };
      }
      const argSlot = step.args.meal_slot;
      const mealSlot: MealSlot | undefined =
        typeof argSlot === "string" &&
        ["breakfast", "lunch", "dinner", "snack", "unspecified"].includes(argSlot)
          ? (argSlot as MealSlot)
          : mealParsed.kind === "meal"
            ? mealParsed.slot
            : undefined;
      const argLogKind = step.args.log_kind;
      const logKind: MealLogKind | undefined =
        typeof argLogKind === "string" &&
        ["meal", "snack", "drink", "supplement", "correction"].includes(argLogKind)
          ? (argLogKind as MealLogKind)
          : mealParsed.kind === "meal"
            ? mealParsed.logKind
            : undefined;
      return runOrchestratedMealLogTurn(
        stepCtx,
        sanitizeMealLogRawText(rawText),
        original,
        {
          mealSlot,
          logKind,
        },
      );
    }

    case "meal_log_photo":
      return runMealPhotoLogTurn(stepCtx);

    case "meal_log_correct": {
      const original = ctx.originalUserMessage?.trim() || ctx.rawMessage.trim();
      if (isMealSlotCorrectionMessage(original)) {
        const today = localDateKey(new Date(), stepCtx.timezone);
        const dayView = await executeMealHistoryCapability(stepCtx, "meal_day_breakdown");
        return {
          text: `${dayView.text}\n\nI can't auto-fix meal **timing** from that message — it would corrupt your log. Send a **full-day recount** to replace today's entries, e.g.:\n\n"For breakfast I had tea. For lunch parathas, raita, sabzi and tea. Evening samosa and tea. Dinner rice and daal."`,
          metadata: {
            specialist: "MealHistory",
            meal_log: false,
            meal_slot_correction_blocked: true,
            pillar_compose: false,
            magnus_voice_finalized: true,
            local_date: today,
          },
        };
      }
      const correctionText =
        extractPastMealFoodText(original) ??
        (typeof step.args.correction_text === "string" && step.args.correction_text.trim()
          ? step.args.correction_text.trim()
          : stepCtx.rawMessage.trim());
      const normalized = normalizeMealLogText(correctionText);
      if (!normalized) {
        return {
          text: "I couldn't log that correction — tell me what you **ate** (e.g. \"I had rice and daal for dinner\"), or send a full-day recount.",
          metadata: {
            specialist: "nutrition",
            meal_log: false,
            meal_log_correct_rejected: true,
            pillar_compose: false,
          },
        };
      }
      await softDeleteMostRecentSession(stepCtx.userProfileId, stepCtx.timezone);
      return runOrchestratedMealLogTurn(stepCtx, normalized, original);
    }

    case "meal_history":
    case "meal_history_undo":
    case "meal_breakdown":
    case "meal_day_breakdown":
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
