import { describe, expect, it } from "vitest";

import {
  LONG_TERM_HEALTH_PLANNING_SYSTEM,
  matchesLongTermHealthPlanningMessage,
} from "./longTermHealthPlanningAgent.js";

describe("longTermHealthPlanningAgent", () => {
  it("exports LONG_TERM_HEALTH_PLANNING_SYSTEM with non-medical scope and seek-care guardrails", () => {
    expect(LONG_TERM_HEALTH_PLANNING_SYSTEM).toMatch(/not.*clinician/i);
    expect(LONG_TERM_HEALTH_PLANNING_SYSTEM).toMatch(/Do \*\*not\*\* diagnose/i);
    expect(LONG_TERM_HEALTH_PLANNING_SYSTEM).toMatch(/race or event prep/i);
    expect(LONG_TERM_HEALTH_PLANNING_SYSTEM).toMatch(/seasons and phases/i);
    expect(LONG_TERM_HEALTH_PLANNING_SYSTEM).toMatch(/emergency/i);
  });

  describe("matchesLongTermHealthPlanningMessage", () => {
    it("matches periodization, seasonal arcs, and multi-week phrasing", () => {
      expect(matchesLongTermHealthPlanningMessage("How should I periodize strength this year?")).toBe(
        true,
      );
      expect(
        matchesLongTermHealthPlanningMessage("16-week base phase before my spring half marathon"),
      ).toBe(true);
      expect(matchesLongTermHealthPlanningMessage("race prep calendar for May goal race")).toBe(
        true,
      );
    });

    it("matches horizon + event when structure words are absent", () => {
      expect(
        matchesLongTermHealthPlanningMessage(
          "Over the next 6 months I want a training plan for my first marathon",
        ),
      ).toBe(true);
    });

    it("does not match single-session or generic fitness chat", () => {
      expect(matchesLongTermHealthPlanningMessage("Leg day was rough today")).toBe(false);
      expect(matchesLongTermHealthPlanningMessage("Quick gym session after work")).toBe(false);
    });
  });
});
