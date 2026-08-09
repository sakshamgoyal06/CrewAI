import { describe, expect, it } from "vitest";

import {
  isMealPlanCancelMessage,
  shouldRouteToMealPlanning,
} from "./mealPlanningRouting.js";

describe("mealPlanningRouting", () => {
  it("detects cancel planning", () => {
    expect(isMealPlanCancelMessage("cancel planning")).toBe(true);
    expect(isMealPlanCancelMessage("please cancel plan")).toBe(true);
  });

  it("routes cancel even without an active session", () => {
    expect(shouldRouteToMealPlanning("cancel planning", null)).toBe(true);
  });

  it("routes any message when a session is active", () => {
    expect(
      shouldRouteToMealPlanning("skip", {
        id: "s1",
        user_profile_id: "u1",
        status: "gathering",
        step: "constraints",
        horizon_start: "2026-08-10",
        horizon_end: "2026-08-23",
        slots: ["breakfast", "lunch", "dinner"],
        constraints_text: null,
        draft_entries: [],
        draft_display: null,
        revision_notes: null,
        created_at: "",
        updated_at: "",
        expires_at: "",
      }),
    ).toBe(true);
  });

  it("routes new planning asks without a session", () => {
    expect(shouldRouteToMealPlanning("plan my meals for the week", null)).toBe(true);
    expect(shouldRouteToMealPlanning("what's on my calendar", null)).toBe(false);
  });
});
