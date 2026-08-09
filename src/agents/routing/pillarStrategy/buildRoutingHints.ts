import { parseMealLogCommand } from "../../../meals/parseMealLogCommand.js";
import { getActiveMealPlanSession } from "../../../nutrition/planning/mealPlanningSessionStore.js";
import { fetchRecentRoutingTurns } from "../../../tools/routingContext.js";
import type { AgentContext } from "../../types.js";
import type { RoutingHints } from "./types.js";

function capabilityFromMetadata(meta: Record<string, unknown> | null | undefined): string | null {
  if (!meta) {
    return null;
  }
  const agentMeta =
    meta.agent_metadata && typeof meta.agent_metadata === "object" && !Array.isArray(meta.agent_metadata)
      ? (meta.agent_metadata as Record<string, unknown>)
      : null;
  const fromStrategy = agentMeta?.pillar_capability ?? meta.pillar_capability;
  if (typeof fromStrategy === "string" && fromStrategy.trim()) {
    return fromStrategy.trim();
  }
  const order = agentMeta?.health_order;
  if (typeof order === "string") {
    return order;
  }
  return null;
}

/** Build routing hints — no health profile or memory block; includes recent turn previews. */
export async function buildRoutingHints(ctx: AgentContext): Promise<RoutingHints> {
  const recent = await fetchRecentRoutingTurns(ctx.userProfileId, ctx.telegramUserId, 6);
  const lastAssistant = [...recent].reverse().find((t) => t.role === "assistant");
  const meta = lastAssistant?.metadata ?? null;

  const agentMeta =
    meta && typeof meta === "object" && !Array.isArray(meta)
      ? ((meta as Record<string, unknown>).agent_metadata as Record<string, unknown> | undefined)
      : undefined;

  const active = await getActiveMealPlanSession(ctx.userProfileId);

  return {
    has_meal_photo: Boolean(ctx.mealPhoto?.fileId),
    explicit_meal_log: parseMealLogCommand(ctx.rawMessage).kind === "meal",
    active_meal_plan_session: Boolean(active),
    meal_plan_session_step: active?.step ?? null,
    previous_turn_intent:
      meta && typeof (meta as Record<string, unknown>).intent === "string"
        ? ((meta as Record<string, unknown>).intent as string)
        : null,
    previous_turn_capability: capabilityFromMetadata(
      meta && typeof meta === "object" ? (meta as Record<string, unknown>) : null,
    ),
    previous_turn_was_meal_log: Boolean(
      agentMeta?.meal_log === true ||
        (meta && (meta as Record<string, unknown>).intent === "meal_log"),
    ),
    previous_turn_meal_plan_locked: Boolean(
      agentMeta?.meal_plan_locked === true || agentMeta?.meal_plan_saved === true,
    ),
    recent_turns: recent.slice(-4).map((t) => ({
      role: t.role === "assistant" ? ("assistant" as const) : ("user" as const),
      preview: t.content.slice(0, 280),
    })),
  };
}
