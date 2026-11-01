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
      openCommitmentCount: 3,
      overdueCommitmentCount: 1,
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
      dayFrame: {
        tone: "working",
        toneReason: "multiple commitments planned today",
        morningIntention: "Ship portfolio draft",
        energyLevel: 4,
        morningNotes: ["Slept late — starting slow"],
      },
      northStar: {
        statement: "Build intentionally",
        goals: [{ title: "Ship portfolio site", pillar: "build", timeframe: "quarterly", status: "active" }],
      },
      operations: {
        todayCommitments: [
          { title: "Gym", status: "planned", pillar: "health", activityKey: "gym" },
        ],
        overdueCount: 1,
        errands: [{ source: "task", slug: "tasks", title: "Renew insurance" }],
        slippingRoutines: [
          { activityKey: "gym", activity: "gym", pillar: "health", recentMisses: 3, showUpRate: 40, total: 5 },
        ],
      },
      projects: {
        active: [
          {
            title: "Job search",
            pillar: "wisdom",
            status: "active",
            openChecklistCount: 2,
            nextChecklistItem: "Update resume",
          },
        ],
        consistencyHint: "1 active project(s) have open next steps (Job search).",
      },
      lists: [{ slug: "watchlist", displayName: "Watchlist", openCount: 4 }],
      listHighlights: [{ slug: "watchlist", title: "Dune Part Two" }],
      behavior: {
        issues: ["Routine slipping on gym"],
        wins: ["Loved new movie"],
        dailyLogSnippets: [{ date: "2026-08-17", snippet: "Feeling tired" }],
        narrativeBullets: ["Issue: Routine slipping on gym", "Morning: Slept late — starting slow"],
      },
      kpis: {
        joyTank: { level: 42, date: "2026-08-18" },
        pillarStatus: [{ pillar: "health", status: "at_risk" }],
        topRoutines: [
          { activity: "gym", pillar: "health", done: 2, missed: 3, total: 5, showUpRate: 40 },
        ],
        consistencyHint: "gym show-up ~40% (3 recent miss(es)) — consistency is the lever.",
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
    parserSignals: {
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
      prefer_intent_health: false,
      consult_pillars: [],
      magnus_capabilities: [],
    },
    gaps: [],
    ...overrides,
  };
}

describe("formatRoutingContextForClassifier", () => {
  it("includes growth blocks for classifier", () => {
    const formatted = formatRoutingContextForClassifier(sampleContext());
    expect(formatted.pending).toEqual({
      mealLogConfirm: { preview: "burrito bowl", mealSlot: "lunch" },
    });
    expect(formatted.growth).toMatchObject({
      day_frame: { tone: "working", morning_intention: "Ship portfolio draft" },
      operations: { slipping_routines: expect.any(Array), errands: expect.any(Array) },
      north_star: { statement: "Build intentionally" },
      projects: { consistency_hint: expect.stringContaining("Job search") },
    });
    expect(
      (formatted.growth as { behavior: { issues: string[] } }).behavior.issues,
    ).toContain("Routine slipping on gym");
  });
});
