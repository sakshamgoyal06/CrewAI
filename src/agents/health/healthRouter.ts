import type { AgentContext, AgentResult, DepartmentAgent } from "../types.js";
import { parseMealLogCommand } from "../../meals/parseMealLogCommand.js";
import {
  fetchUserHealthProfile,
  formatHealthPreferencesForPrompt,
} from "./healthOnboarding.js";
import { loadHealthReferenceBlock } from "../../pillars/health/references/loadHealthReferences.js";
import { buildRoutingHints } from "../routing/pillarStrategy/buildRoutingHints.js";
import { executeHealthStrategy, healthDeterministicCapability } from "../routing/pillarStrategy/executeHealthStrategy.js";
import { parsePillarExecutionPlan } from "../routing/pillarStrategy/parsePillarStrategy.js";
import { planFromSingleCapability } from "../routing/pillarStrategy/types.js";
import { tryMealPlanReadAgent } from "./mealPlanReadAgent.js";
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

  const deterministic = healthDeterministicCapability(ctxWithPrefs);
  if (deterministic === "meal_log_photo") {
    const plan = deterministicHealthPlan("meal_log_photo");
    return executeHealthStrategy({ ...ctxWithPrefs, pillarStrategy: plan }, plan);
  }
  if (deterministic === "meal_log") {
    const mealParsed = parseMealLogCommand(ctx.rawMessage);
    if (mealParsed.kind === "meal") {
      const plan = deterministicHealthPlan("meal_log");
      return executeHealthStrategy({ ...ctxWithPrefs, pillarStrategy: plan }, plan);
    }
  }

  const hints = await buildRoutingHints(ctxWithPrefs);

  if (!hints.active_meal_plan_session) {
    const mealPlanRead = await tryMealPlanReadAgent(ctxWithPrefs);
    if (mealPlanRead) {
      return mealPlanRead;
    }
  }

  const plan = await parsePillarExecutionPlan("HEALTH", ctx.rawMessage, hints);
  return executeHealthStrategy({ ...ctxWithPrefs, pillarStrategy: plan }, plan);
}

export const healthCompositeAgent: DepartmentAgent = {
  name: "HealthComposite",
  departmentId: "HEALTH",
  run: routeHealthMessage,
};
