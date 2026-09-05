import type { AgentContext, AgentResult, DepartmentAgent } from "../types.js";
import {
  getMealLogPending,
  isMealLogConfirmationNo,
  isMealLogConfirmationYes,
} from "../../meals/mealLogPending.js";
import {
  fetchUserHealthProfile,
  formatHealthPreferencesForPrompt,
} from "./healthOnboarding.js";
import { loadHealthReferenceBlock } from "../../pillars/health/references/loadHealthReferences.js";
import { buildRoutingHints } from "../routing/pillarStrategy/buildRoutingHints.js";
import { executeHealthStrategy } from "../routing/pillarStrategy/executeHealthStrategy.js";
import { parsePillarExecutionPlan } from "../routing/pillarStrategy/parsePillarStrategy.js";
import { planFromSingleCapability } from "../routing/pillarStrategy/types.js";

/** Pending meal-log confirmation gate (FSM — not regex routing). */
function pendingConfirmationPlan(): ReturnType<typeof planFromSingleCapability> {
  return planFromSingleCapability("meal_log", {}, 1, "deterministic");
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
    const plan = pendingConfirmationPlan();
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
