import type { AgentContext } from "../../types.js";
import { parseMealLogCommand } from "../../../meals/parseMealLogCommand.js";
import { isMealPhotoPurpose } from "../../../vision/resolvePhotoIntent.js";

/** Deterministic gates before LLM parser — unambiguous entry points. */
export function healthDeterministicCapability(ctx: AgentContext): string | null {
  if (isMealPhotoPurpose(ctx.photoContext)) {
    return "meal_log_photo";
  }
  if (ctx.mealPhoto?.fileId && !ctx.photoContext) {
    return "meal_log_photo";
  }
  if (parseMealLogCommand(ctx.rawMessage).kind === "meal") {
    return "meal_log";
  }
  return null;
}
