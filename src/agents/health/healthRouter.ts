import type { AgentContext, AgentResult, DepartmentAgent } from "../types.js";
import { buildMealLogPlanFromIntakeParser } from "../../meals/mealIntakePlan.js";
import { isMealCalorieDisputeMessage } from "../../meals/mealCalorieDispute.js";
import { isMealLogWriteIntent, isMealPlanningIntent, isMealSlotCorrectionMessage } from "../../meals/mealLogIntent.js";
import {
  getMealLogPending,
  isMealLogConfirmationNo,
  isMealLogConfirmationYes,
} from "../../meals/mealLogPending.js";
import {
  executeMealHistoryCapability,
  isMealDayBreakdownRequest,
} from "./mealHistoryAgent.js";
import {
  fetchUserHealthProfile,
  formatHealthPreferencesForPrompt,
} from "./healthOnboarding.js";
import { loadHealthReferenceBlock } from "../../pillars/health/references/loadHealthReferences.js";
import { buildRoutingHints } from "../routing/pillarStrategy/buildRoutingHints.js";
import { executeHealthStrategy, healthDeterministicCapability } from "../routing/pillarStrategy/executeHealthStrategy.js";
import { parsePillarExecutionPlan } from "../routing/pillarStrategy/parsePillarStrategy.js";
import { planFromSingleCapability } from "../routing/pillarStrategy/types.js";
import { looksLikeMealSlotFollowUp } from "../routing/mealPlanFollowUp.js";
import { HEALTH_GENERIC_ACK } from "./healthConstants.js";

/** @deprecated Import from healthConstants.js */
export { HEALTH_GENERIC_ACK };

/** Map deterministic pre-gates to HEALTH capabilities (format/attachment — not regex routing). */
function deterministicHealthPlan(capability: string): ReturnType<typeof planFromSingleCapability> {
  return planFromSingleCapability(capability, {}, 1, "deterministic");
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

  const mealLogPending = await getMealLogPending(ctx.userProfileId);
  if (
    mealLogPending &&
    (isMealLogConfirmationYes(ctx.rawMessage) || isMealLogConfirmationNo(ctx.rawMessage))
  ) {
    const plan = deterministicHealthPlan("meal_log");
    return executeHealthStrategy({ ...ctxWithPrefs, pillarStrategy: plan }, plan);
  }

  const deterministic = healthDeterministicCapability(ctxWithPrefs);
  if (deterministic === "meal_history" && isMealCalorieDisputeMessage(ctx.rawMessage)) {
    const plan = deterministicHealthPlan("meal_history");
    return executeHealthStrategy({ ...ctxWithPrefs, pillarStrategy: plan }, plan);
  }
  if (isMealDayBreakdownRequest(ctx.rawMessage)) {
    return executeMealHistoryCapability(ctxWithPrefs, "meal_day_breakdown");
  }
  if (isMealSlotCorrectionMessage(ctx.rawMessage)) {
    const plan = deterministicHealthPlan("meal_log_correct");
    return executeHealthStrategy({ ...ctxWithPrefs, pillarStrategy: plan }, plan);
  }
  if (deterministic === "meal_log_photo") {
    const plan = deterministicHealthPlan("meal_log_photo");
    return executeHealthStrategy({ ...ctxWithPrefs, pillarStrategy: plan }, plan);
  }

  if (isMealLogWriteIntent(ctx.rawMessage) && !isMealPlanningIntent(ctx.rawMessage)) {
    const intakePlan = await buildMealLogPlanFromIntakeParser(ctxWithPrefs);
    if (intakePlan) {
      return executeHealthStrategy({ ...ctxWithPrefs, pillarStrategy: intakePlan }, intakePlan);
    }
  }

  if (looksLikeMealSlotFollowUp(ctx.rawMessage)) {
    const slot = ctx.rawMessage.trim().match(/\b(breakfast|lunch|dinner|snack)\b/i)?.[1]?.toLowerCase();
    const plan = planFromSingleCapability(
      "meal_plan_read",
      { slot, date_hint: "today" },
      1,
      "deterministic",
    );
    return executeHealthStrategy({ ...ctxWithPrefs, pillarStrategy: plan }, plan);
  }

  const hints = await buildRoutingHints(ctxWithPrefs);
  const plan = await parsePillarExecutionPlan("HEALTH", ctx.rawMessage, hints);
  return executeHealthStrategy({ ...ctxWithPrefs, pillarStrategy: plan }, plan);
}

export const healthCompositeAgent: DepartmentAgent = {
  name: "HealthComposite",
  departmentId: "HEALTH",
  run: routeHealthMessage,
};
