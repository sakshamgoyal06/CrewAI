import type { AgentContext } from "../../types.js";
import { isMinimalMode } from "../../../config/minimalMode.js";
import { isMealCalorieDisputeMessage } from "../../../meals/mealCalorieDispute.js";
import { isMealPhotoPurpose } from "../../../vision/resolvePhotoIntent.js";

/** Deterministic gates before LLM parser — vision purpose and explicit dispute only (no regex routing). */
export function healthDeterministicCapability(ctx: AgentContext): string | null {
  if (isMinimalMode()) {
    return null;
  }
  if (isMealCalorieDisputeMessage(ctx.rawMessage)) {
    return "meal_history";
  }
  if (isMealPhotoPurpose(ctx.photoContext)) {
    return "meal_log_photo";
  }
  if (ctx.mealPhoto?.fileId && !ctx.photoContext) {
    return "meal_log_photo";
  }
  return null;
}
