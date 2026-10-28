import { describe, expect, it } from "vitest";

import {
  messageHasPillarSignal,
  resolvePillarsToConsultOnGeneral,
} from "./pillarConsultationSignals.js";

describe("pillarConsultationSignals", () => {
  it("reads consult pillars from routing context", () => {
    expect(
      resolvePillarsToConsultOnGeneral({
        userMessage: "log check-in and review workout",
        routingContext: {
          explicit_meal_log: false,
          looks_like_meal_log_read: false,
          looks_like_youtube_action: false,
          looks_like_magnus_tool_action: true,
          looks_like_magnus_tool_continuation: false,
          looks_like_health_fitness_read: true,
          looks_like_wealth_portfolio_read: false,
          holistic_day_ask: false,
          saved_media_pick: false,
          schedule_accuracy_challenge: false,
          compound_action: true,
          prefer_intent_health: false,
          consult_pillars: ["HEALTH"],
          magnus_capabilities: ["lists"],
        },
      }),
    ).toEqual(["HEALTH"]);
  });

  it("messageHasPillarSignal uses routing context consult list", () => {
    expect(
      messageHasPillarSignal("anything", "WEALTH", {
        explicit_meal_log: false,
        looks_like_meal_log_read: false,
        looks_like_youtube_action: false,
        looks_like_magnus_tool_action: false,
        looks_like_magnus_tool_continuation: false,
        looks_like_health_fitness_read: false,
        looks_like_wealth_portfolio_read: true,
        holistic_day_ask: false,
        saved_media_pick: false,
        schedule_accuracy_challenge: false,
        compound_action: false,
        prefer_intent_health: false,
        consult_pillars: ["WEALTH"],
        magnus_capabilities: [],
      }),
    ).toBe(true);
  });

  it("returns empty when routing context has no consult pillars", () => {
    expect(
      resolvePillarsToConsultOnGeneral({ userMessage: "thanks", recentTurns: [] }),
    ).toEqual([]);
  });
});
