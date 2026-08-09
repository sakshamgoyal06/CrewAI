/**
 * Meal planning journey entry — multi-turn gather, draft, lock.
 */
import { isMealCommand } from "../../meals/parseMealLogCommand.js";
import type { AgentContext, AgentResult } from "../types.js";
import { matchesMealPlanReadMessage } from "./mealPlanReadAgent.js";
import { matchesMealPlannerMessage } from "./mealPlannerPatterns.js";
import {
  getActiveMealPlanSession,
} from "../../nutrition/planning/mealPlanningSessionStore.js";
import {
  mealPlanningIntro,
  runMealPlanningTurn,
} from "../../nutrition/planning/mealPlanningFlow.js";

export function matchesMealPlanningMessage(rawMessage: string): boolean {
  return matchesMealPlannerMessage(rawMessage);
}

/** Run meal planning journey — used by pillar strategy executor (no regex gate). */
export async function executeMealPlanningCapability(ctx: AgentContext): Promise<AgentResult> {
  const active = await getActiveMealPlanSession(ctx.userProfileId);

  if (!active) {
    const result = await runMealPlanningTurn(ctx, null);
    if (result.metadata?.meal_plan_step === "horizon" && !result.metadata?.meal_plan_drafted) {
      return {
        text: `${mealPlanningIntro()}\n\n${result.text}`,
        metadata: result.metadata,
      };
    }
    return result;
  }

  return runMealPlanningTurn(ctx, active);
}

export async function tryMealPlanningAgent(ctx: AgentContext): Promise<AgentResult | null> {
  if (isMealCommand(ctx.rawMessage)) {
    return null;
  }
  if (matchesMealPlanReadMessage(ctx.rawMessage)) {
    return null;
  }

  const active = await getActiveMealPlanSession(ctx.userProfileId);
  const isPlanningAsk = matchesMealPlannerMessage(ctx.rawMessage);

  if (!active && !isPlanningAsk) {
    return null;
  }

  return executeMealPlanningCapability(ctx);
}
