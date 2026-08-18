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
    growth: {
      local_time: {
        date_key: ctx.growth.localTime.dateKey,
        hour: ctx.growth.localTime.hour,
        is_late_evening: ctx.growth.localTime.isLateEvening,
      },
      lists: ctx.growth.lists,
      list_highlights: ctx.growth.listHighlights,
      goals: ctx.growth.goals,
      today_win: {
        morning_intention: ctx.growth.todayWin.morningIntention ?? null,
        energy_level: ctx.growth.todayWin.energyLevel ?? null,
        win_condition_pending: ctx.growth.todayWin.winConditionPending ?? null,
      },
      behavior: {
        narrative_bullets: ctx.growth.behavior.narrativeBullets,
        recent_issues: ctx.growth.behavior.recentIssues,
        recent_wins: ctx.growth.behavior.recentWins,
      },
      kpis: {
        joy_tank: ctx.growth.kpis.joyTank ?? null,
        pillar_status: ctx.growth.kpis.pillarStatus,
        activity_stats: ctx.growth.kpis.activityStats,
        gym_miss_streak_days: ctx.growth.kpis.gymMissStreakDays ?? null,
        routine_consistency_hint: ctx.growth.kpis.routineConsistencyHint ?? null,
      },
    },
    routing_hints: ctx.routingHints,
    gaps: ctx.gaps,
  };
}
