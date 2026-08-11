/**
 * Orchestrate a parsed pillar execution plan: sequential step executors → composer.
 */
import { localDateKey } from "../../../nutrition/localDate.js";
import { softDeleteSessionsForLocalDate } from "../../../nutrition/store/mealHistoryStore.js";
import { isFullDayMealRecount } from "../../../meals/mealDayRecount.js";
import type { AgentContext, AgentResult } from "../../types.js";
import {
  composePillarPlanReply,
  formatPriorStepContext,
} from "./composePillarPlanReply.js";
import { executePlanStep } from "./executePlanStep.js";
import { pillarPlanComposeEnabled } from "./parsePillarStrategy.js";
import type { PillarExecutionPlan, PillarId, PlanStepResult } from "./types.js";
import { withPillarPlanMeta } from "./withStrategyMeta.js";

export async function executePillarPlan(
  pillar: PillarId,
  ctx: AgentContext,
  plan: PillarExecutionPlan,
  extraMeta?: Record<string, unknown>,
): Promise<AgentResult> {
  const originalMessage = ctx.originalUserMessage?.trim() || ctx.rawMessage.trim();
  const isMultiMealLog =
    pillar === "HEALTH" &&
    plan.steps.length > 1 &&
    plan.steps.every((s) => s.capability === "meal_log" || s.capability === "meal_log_correct");

  if (isMultiMealLog && isFullDayMealRecount(originalMessage)) {
    const localDate = localDateKey(new Date(), ctx.timezone);
    await softDeleteSessionsForLocalDate(ctx.userProfileId, localDate, ctx.timezone);
  }

  const stepResults: PlanStepResult[] = [];

  for (let i = 0; i < plan.steps.length; i += 1) {
    const step = plan.steps[i]!;
    const priorContext = formatPriorStepContext(stepResults);
    const result = await executePlanStep(pillar, ctx, step, priorContext);
    stepResults.push({
      step_index: i,
      capability: step.capability,
      text: result.text,
      metadata: result.metadata ?? {},
    });
  }

  let finalText: string;
  const skipCompose =
    stepResults.some((s) => s.metadata?.pillar_compose === false) &&
    stepResults.every((s) => s.metadata?.pillar_compose === false);

  if (!pillarPlanComposeEnabled() || skipCompose) {
    finalText =
      stepResults.length === 1
        ? (stepResults[0]?.text ?? "…")
        : stepResults.map((s) => s.text.trim()).join("\n\n---\n\n");
  } else {
    finalText = await composePillarPlanReply(ctx, plan, stepResults);
  }

  const mergedMetadata: Record<string, unknown> = {
    magnus_voice_finalized: pillarPlanComposeEnabled() && !skipCompose,
  };
  const mealSessionIds: string[] = [];
  for (const s of stepResults) {
    Object.assign(mergedMetadata, s.metadata);
    const sessionId = s.metadata?.meal_session_id;
    if (typeof sessionId === "string" && sessionId.trim()) {
      mealSessionIds.push(sessionId);
    }
  }
  if (mealSessionIds.length > 0) {
    mergedMetadata.meal_session_ids = mealSessionIds;
    mergedMetadata.meal_session_id = mealSessionIds[mealSessionIds.length - 1];
    mergedMetadata.meal_log = true;
  } else if (stepResults.some((s) => s.capability === "meal_log" || s.capability === "meal_log_correct")) {
    mergedMetadata.meal_log = false;
  }

  return withPillarPlanMeta(
    {
      text: finalText,
      metadata: {
        ...mergedMetadata,
        pillar_plan_executed: true,
      },
    },
    plan,
    stepResults,
    "pillar_plan",
    extraMeta,
  );
}
