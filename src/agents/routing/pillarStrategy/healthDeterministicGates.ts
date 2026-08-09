import type { AgentContext } from "../../types.js";
import { parseMealLogCommand } from "../../../meals/parseMealLogCommand.js";

/** Deterministic gates before LLM parser — unambiguous entry points. */
export function healthDeterministicCapability(ctx: AgentContext): string | null {
  if (ctx.mealPhoto?.fileId) {
    return "meal_log_photo";
  }
  if (parseMealLogCommand(ctx.rawMessage).kind === "meal") {
    return "meal_log";
  }
  return null;
}
