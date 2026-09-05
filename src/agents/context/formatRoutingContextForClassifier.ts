import type { RoutingContext } from "./types.js";

/**
 * Compact JSON-safe view for the intent classifier.
 * Omits large fields; keeps disambiguation and growth-alignment signals.
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
      open_commitment_count: ctx.activeWork.openCommitmentCount,
      overdue_commitment_count: ctx.activeWork.overdueCommitmentCount,
    },
    standing: {
      program_notes: ctx.standing.programNotes,
      routing_facts: ctx.standing.routingFacts,
    },
    growth: {
      local_time: {
        date_key: ctx.growth.localTime.dateKey,
        hour: ctx.growth.localTime.hour,
        is_late_evening: ctx.growth.localTime.isLateEvening,
      },
      day_frame: {
        tone: ctx.growth.dayFrame.tone,
        tone_reason: ctx.growth.dayFrame.toneReason ?? null,
        morning_intention: ctx.growth.dayFrame.morningIntention ?? null,
        energy_level: ctx.growth.dayFrame.energyLevel ?? null,
        feeling: ctx.growth.dayFrame.feeling ?? null,
        morning_notes: ctx.growth.dayFrame.morningNotes,
        win_condition_pending: ctx.growth.dayFrame.winConditionPending ?? null,
      },
      north_star: {
        statement: ctx.growth.northStar.statement ?? null,
        goals: ctx.growth.northStar.goals,
      },
      operations: {
        today_commitments: ctx.growth.operations.todayCommitments,
        overdue_count: ctx.growth.operations.overdueCount,
        errands: ctx.growth.operations.errands,
        slipping_routines: ctx.growth.operations.slippingRoutines,
      },
      projects: {
        active: ctx.growth.projects.active,
        consistency_hint: ctx.growth.projects.consistencyHint ?? null,
      },
      lists: ctx.growth.lists,
      list_highlights: ctx.growth.listHighlights,
      behavior: {
        narrative_bullets: ctx.growth.behavior.narrativeBullets,
        issues: ctx.growth.behavior.issues,
        wins: ctx.growth.behavior.wins,
      },
      kpis: {
        joy_tank: ctx.growth.kpis.joyTank ?? null,
        pillar_status: ctx.growth.kpis.pillarStatus,
        top_routines: ctx.growth.kpis.topRoutines,
        consistency_hint: ctx.growth.kpis.consistencyHint ?? null,
      },
    },
    routing_hints: ctx.routingHints,
    gaps: ctx.gaps,
  };
}
