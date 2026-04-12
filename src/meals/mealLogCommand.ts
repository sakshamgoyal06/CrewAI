import { parseMealLogCommand } from "./parseMealLogCommand.js";
import { completeMealLogFromPipeline, formatMealLogSaveFailure } from "./mealLogPipeline.js";

export type MealLogCommandResult =
  | { handled: false }
  | { handled: true; reply: string; mealSessionId?: string };

export { formatMealLogSaveFailure };

/**
 * Legacy direct pipeline (no Nutrition agent). Prefer orchestrated flow via HEALTH router.
 * If the message is a meal-log command, estimate nutrition, persist, return a confirmation.
 * Otherwise returns `handled: false` so normal orchestration runs.
 */
export async function tryProcessMealLog(input: {
  userMessage: string;
  userProfileId: string;
}): Promise<MealLogCommandResult> {
  const parsed = parseMealLogCommand(input.userMessage);
  if (parsed.kind !== "meal") {
    return { handled: false };
  }

  const result = await completeMealLogFromPipeline({
    userProfileId: input.userProfileId,
    rawMealText: parsed.text,
    nutritionQuery: parsed.text,
  });

  if (!result.ok) {
    return { handled: true, reply: result.reply };
  }

  return {
    handled: true,
    mealSessionId: result.mealSessionId,
    reply: result.reply,
  };
}
