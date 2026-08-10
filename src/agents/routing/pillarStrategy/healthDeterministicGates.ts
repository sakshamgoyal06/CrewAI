import type { AgentContext } from "../../types.js";
import { parseMealLogCommand } from "../../../meals/parseMealLogCommand.js";
import { sanitizeMealLogRawText } from "../../../meals/sanitizeMealLogRawText.js";

const NON_MEAL_PHOTO_CAPTION_RE =
  /\b(?:book|books|readlist|read\s+list|watchlist|screenshot|instagram|invoice|document|receipt(?!\s+for\s+(?:food|meal)))\b/i;

/** Deterministic gates before LLM parser — unambiguous entry points. */
export function healthDeterministicCapability(ctx: AgentContext): string | null {
  if (ctx.mealPhoto?.fileId) {
    const caption = (ctx.mealPhoto.caption ?? ctx.rawMessage ?? "").trim();
    if (NON_MEAL_PHOTO_CAPTION_RE.test(caption)) {
      return null;
    }
    return "meal_log_photo";
  }
  if (parseMealLogCommand(ctx.rawMessage).kind === "meal") {
    return "meal_log";
  }
  return null;
}
