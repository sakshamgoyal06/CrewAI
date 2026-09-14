import type { AgentContext } from "../agents/types.js";
import { parseMealIntakeFromMessage } from "../agents/health/mealIntakeParserAgent.js";
import type { PillarExecutionPlan } from "../agents/routing/pillarStrategy/types.js";
import { collapseMealIntakeForSingleOccasion } from "./mealIntakeCollapse.js";

/** Build a multi-step meal_log plan from the intake parser agent (no regex splitting). */
export async function buildMealLogPlanFromIntakeParser(
  ctx: AgentContext,
): Promise<PillarExecutionPlan | null> {
  const intakeRaw = await parseMealIntakeFromMessage(ctx);
  if (!intakeRaw || intakeRaw.meals.length === 0) {
    return null;
  }
  const intake = collapseMealIntakeForSingleOccasion(intakeRaw, ctx.rawMessage);

  return {
    confidence: intake.parser === "llm" ? 0.95 : 0.7,
    parser: "llm",
    replace_today_log: intake.replaceTodayLog,
    steps: intake.meals.map((meal) => ({
      capability: "meal_log",
      args: {
        meal_text: meal.mealText,
        meal_slot: meal.mealSlot,
        log_kind: meal.logKind,
        intake_components: meal.components,
      },
      intent_summary: meal.mealText,
    })),
  };
}
