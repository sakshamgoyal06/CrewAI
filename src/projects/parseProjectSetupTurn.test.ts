import { describe, expect, it } from "vitest";
import {
  normalizeProjectSetupParse,
  projectSetupIntentActionable,
} from "./parseProjectSetupTurn.js";

describe("normalizeProjectSetupParse", () => {
  it("accepts lock intent from LLM JSON", () => {
    const parsed = normalizeProjectSetupParse(
      {
        intent: "lock",
        confidence: 0.92,
        theme_id: "job_search",
      },
      "custom",
    );
    expect(parsed.intent).toBe("lock");
    expect(parsed.confidence).toBe(0.92);
    expect(parsed.theme_id).toBe("job_search");
    expect(parsed.parser).toBe("llm");
  });

  it("maps cancel_setup for quit phrases", () => {
    const parsed = normalizeProjectSetupParse(
      {
        intent: "cancel_setup",
        confidence: 0.88,
        theme_id: "job_search",
      },
      "custom",
    );
    expect(parsed.intent).toBe("cancel_setup");
    expect(projectSetupIntentActionable(parsed)).toBe(true);
  });

  it("falls back theme when invalid", () => {
    const parsed = normalizeProjectSetupParse(
      { intent: "show_review", theme_id: "not_a_theme" },
      "trip_plan",
    );
    expect(parsed.theme_id).toBe("trip_plan");
  });

  it("normalizes checklist arrays", () => {
    const parsed = normalizeProjectSetupParse(
      {
        intent: "revise_draft",
        checklist: ["  Update CV  ", "", "Network"],
      },
      "custom",
    );
    expect(parsed.checklist).toEqual(["Update CV", "Network"]);
  });

  it("requires higher confidence for lock and cancel", () => {
    expect(
      projectSetupIntentActionable({
        intent: "lock",
        confidence: 0.4,
        theme_id: "custom",
        title: null,
        outcome: null,
        target_date: null,
        checklist: null,
        milestones: null,
        parser: "llm",
      }),
    ).toBe(false);
    expect(
      projectSetupIntentActionable({
        intent: "lock",
        confidence: 0.8,
        theme_id: "custom",
        title: null,
        outcome: null,
        target_date: null,
        checklist: null,
        milestones: null,
        parser: "llm",
      }),
    ).toBe(true);
  });
});
