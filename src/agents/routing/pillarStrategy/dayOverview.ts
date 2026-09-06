/**
 * Holistic day snapshot — calendar, Magnus commitments, planned meals.
 * Used by GENERAL day_overview capability (parser-owned, not regex routing).
 */
import { isMinimalMode } from "../../../config/minimalMode.js";
import {
  buildDayContext,
  formatDayContextSections,
  resolveOverviewDate,
} from "../../../day/buildDayContext.js";
import type { AgentContext, AgentResult } from "../../types.js";

export { resolveOverviewDate };

export async function executeDayOverviewCapability(
  ctx: AgentContext,
  args: Record<string, unknown> = {},
): Promise<AgentResult> {
  const tz = ctx.timezone ?? "UTC";
  const dateHint =
    typeof args.date_hint === "string" && args.date_hint.trim()
      ? args.date_hint.trim()
      : null;
  const { localDate, label, offsetDays } = resolveOverviewDate(tz, dateHint);
  const includeMeals = !isMinimalMode();

  const dayContext = await buildDayContext({
    userProfileId: ctx.userProfileId,
    timezone: tz,
    localDate,
    label,
    offsetDays,
    includeMeals,
  });

  const userGraphNote =
    ctx.memoryBlock?.trim() && ctx.memoryBlock.length < 1200
      ? `\n\n_User context (internal — use for tone, not to repeat verbatim):_\n${ctx.memoryBlock.trim().slice(0, 800)}`
      : "";

  return {
    text: formatDayContextSections(dayContext, { includeMeals }) + userGraphNote,
    metadata: {
      specialist: "Magnus",
      day_overview: true,
      overview_date: localDate,
      overview_label: label,
      pillar_compose: true,
    },
  };
}
