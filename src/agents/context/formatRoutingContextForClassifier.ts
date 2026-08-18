import type { RoutingContext } from "./types.js";

/**
 * Compact JSON-safe view for the intent classifier.
 * Omits large fields; keeps disambiguation signals from real chat patterns:
 * Yes/undo follow-ups, meal confirm, project/meal-plan FSM, integrations, active work.
 */
export function formatRoutingContextForClassifier(ctx: RoutingContext): Record<string, unknown> {
  return {
    identity: {
      timezone: ctx.identity.timezone,
      display_name: ctx.identity.displayName ?? null,
      north_star_goal: ctx.identity.northStarGoal || null,
      health_onboarding_complete: ctx.identity.healthOnboardingComplete,
    },
    integrations: ctx.integrations,
    recent_turns: ctx.recentTurns.map((t) => ({
      role: t.role,
      content: t.content,
      intent: t.intent ?? null,
      delegated_agent: t.delegatedAgent ?? null,
      tools_used: t.toolsUsed ?? [],
    })),
    pending: ctx.pending,
    active_work: {
      active_projects: ctx.activeWork.activeProjects,
      gym_event_today: ctx.activeWork.gymEventToday,
      open_commitment_count: ctx.activeWork.openCommitmentCount,
    },
    standing: {
      program_notes: ctx.standing.programNotes,
      routing_facts: ctx.standing.routingFacts,
    },
    routing_hints: ctx.routingHints,
    gaps: ctx.gaps,
  };
}
