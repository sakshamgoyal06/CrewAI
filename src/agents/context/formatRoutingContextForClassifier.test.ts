import { describe, expect, it } from "vitest";

import { formatRoutingContextForClassifier } from "./formatRoutingContextForClassifier.js";
import type { RoutingContext } from "./types.js";

function sampleContext(overrides: Partial<RoutingContext> = {}): RoutingContext {
  return {
    userProfileId: "00000000-0000-0000-0000-000000000001",
    assembledAt: "2026-08-18T00:00:00.000Z",
    identity: {
      timezone: "Asia/Kolkata",
      northStarGoal: "Build intentionally",
      healthOnboardingComplete: true,
      displayName: "Saksham",
    },
    integrations: {
      notion: "connected",
      googleCalendar: "connected",
      youtube: "connected",
      hevy: "connected",
      zerodha: "token_set",
    },
    recentTurns: [
      {
        role: "assistant",
        content: "Want me to log the burrito bowl?",
        delegatedAgent: "Health",
        toolsUsed: ["meal_log"],
      },
      { role: "user", content: "Yes" },
    ],
    pending: {
      mealLogConfirm: { preview: "burrito bowl", mealSlot: "lunch" },
    },
    activeWork: {
      activeProjects: [{ title: "Job search", pillar: "wisdom", status: "active" }],
      gymEventToday: true,
      openCommitmentCount: 3,
    },
    standing: {
      programNotes: ["Avoid lauki"],
      routingFacts: ["User prefers Friday burger exception"],
    },
    growth: {
      localTime: {
        dateKey: "2026-08-18",
        hour: 22,
        minute: 15,
        isLateEvening: true,
      },
      lists: [
        { slug: "watchlist", displayName: "Watchlist", openCount: 4 },
        { slug: "tasks", displayName: "Tasks", openCount: 2 },
      ],
      listHighlights: [{ slug: "watchlist", title: "Dune Part Two" }],
      goals: [{ title: "Ship portfolio site", pillar: "build", status: "active" }],
      todayWin: {
        morningIntention: "Gym before work",
        energyLevel: 4,
      },
      behavior: {
        recentIssues: ["Missing gym 3 days"],
        recentWins: ["Loved new movie"],
        dailyLogSnippets: [{ date: "2026-08-17", snippet: "Feeling tired" }],
        narrativeBullets: [
          "Watch: Missing gym 3 days",
          "2026-08-17: Feeling tired",
        ],
      },
      kpis: {
        joyTank: { level: 42, date: "2026-08-18" },
        pillarStatus: [{ pillar: "health", status: "at_risk" }],
        activityStats: [
          { activity: "gym", pillar: "health", done: 2, missed: 3, total: 5, showUpRate: 40 },
        ],
        gymMissStreakDays: 3,
        routineConsistencyHint:
          "Gym missed or skipped 3 times recently — protect recovery and show-up tomorrow.",
      },
    },
    routingHints: {
      explicit_meal_log: false,
      looks_like_meal_log_read: false,
      looks_like_youtube_action: false,
      looks_like_magnus_tool_action: false,
      looks_like_magnus_tool_continuation: true,
      looks_like_health_fitness_read: false,
      looks_like_wealth_portfolio_read: false,
      holistic_day_ask: false,
      saved_media_pick: false,
      schedule_accuracy_challenge: false,
      compound_action: false,
    },
    gaps: [],
    ...overrides,
  };
}

describe("formatRoutingContextForClassifier", () => {
  it("includes pending state and integrations for classifier", () => {
    const formatted = formatRoutingContextForClassifier(sampleContext());
    expect(formatted.pending).toEqual({
      mealLogConfirm: { preview: "burrito bowl", mealSlot: "lunch" },
    });
    expect(formatted.integrations).toMatchObject({ googleCalendar: "connected" });
    expect(formatted.recent_turns).toHaveLength(2);
    expect(formatted.standing).toMatchObject({
      program_notes: ["Avoid lauki"],
    });
    expect(formatted.growth).toMatchObject({
      local_time: { is_late_evening: true, hour: 22 },
      today_win: { morning_intention: "Gym before work" },
      kpis: { gym_miss_streak_days: 3, joy_tank: { level: 42 } },
    });
    expect((formatted.growth as { behavior: { narrative_bullets: string[] } }).behavior.narrative_bullets).toContain(
      "Watch: Missing gym 3 days",
    );
  });
});
