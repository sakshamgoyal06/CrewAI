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
  });
});
