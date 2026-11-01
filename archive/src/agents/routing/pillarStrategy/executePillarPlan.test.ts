import { beforeEach, describe, expect, it, vi } from "vitest";

const composeMock = vi.fn();
const executePlanStepMock = vi.fn();

vi.mock("../../../nutrition/store/mealHistoryStore.js", () => ({
  softDeleteSessionsForLocalDate: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./composePillarPlanReply.js", () => ({
  composePillarPlanReply: (...args: unknown[]) => composeMock(...args),
  formatPriorStepContext: () => "",
}));

vi.mock("./executePlanStep.js", () => ({
  executePlanStep: (...args: unknown[]) => executePlanStepMock(...args),
}));

vi.mock("./parsePillarStrategy.js", () => ({
  pillarPlanComposeEnabled: () => true,
}));

import { executePillarPlan } from "./executePillarPlan.js";

describe("executePillarPlan", () => {
  beforeEach(() => {
    composeMock.mockReset();
    composeMock.mockResolvedValue("Magnus composed.");
    executePlanStepMock.mockReset();
    executePlanStepMock.mockResolvedValue({
      text: "Specialist raw output.",
      metadata: { specialist: "Test", pillar_compose: true },
    });
  });

  it("always composes single-step output by default", async () => {
    const out = await executePillarPlan(
      "HEALTH",
      {
        userProfileId: "u1",
        telegramUserId: "t1",
        rawMessage: "test",
        intent: "HEALTH",
      },
      {
        steps: [{ capability: "nutrition_advice", args: {} }],
        confidence: 1,
        parser: "llm",
      },
    );

    expect(composeMock).toHaveBeenCalledTimes(1);
    expect(out.text).toBe("Magnus composed.");
    expect(out.metadata?.magnus_voice_finalized).toBe(true);
  });

  it("composes multi-meal logs even when each step opts out of pillar compose", async () => {
    executePlanStepMock
      .mockResolvedValueOnce({
        text: "**Breakfast logged**\n**This meal:** ~90 kcal",
        metadata: {
          specialist: "nutrition",
          pillar_compose: false,
          magnus_voice_finalized: true,
          meal_session_id: "sess-1",
          meal_log_compose: {
            mealSlot: "breakfast",
            headline: "Breakfast — tea",
            totals: { calories: 90, protein_g: 2.5, carbs_g: 14, fat_g: 2.5 },
          },
        },
      })
      .mockResolvedValueOnce({
        text: "**Lunch logged**\n**This meal:** ~514 kcal",
        metadata: {
          specialist: "nutrition",
          pillar_compose: false,
          magnus_voice_finalized: true,
          meal_session_id: "sess-2",
          meal_log_compose: {
            mealSlot: "lunch",
            headline: "Lunch — parathas",
            totals: { calories: 514, protein_g: 15.2, carbs_g: 60.6, fat_g: 24 },
          },
        },
      });

    composeMock.mockResolvedValue("**Meals logged**\n\n**Breakfast — tea** — ~90 kcal");

    const out = await executePillarPlan(
      "HEALTH",
      {
        userProfileId: "u1",
        telegramUserId: "t1",
        rawMessage:
          "For breakfast I had tea. For lunch I had parathas.",
        intent: "HEALTH",
      },
      {
        steps: [
          { capability: "meal_log", args: { meal_text: "tea" } },
          { capability: "meal_log", args: { meal_text: "parathas" } },
        ],
        confidence: 1,
        parser: "deterministic",
      },
    );

    expect(composeMock).toHaveBeenCalledTimes(1);
    expect(out.text).toBe("**Meals logged**\n\n**Breakfast — tea** — ~90 kcal");
    expect(out.text).not.toContain("---");
    expect(out.metadata?.magnus_voice_finalized).toBe(true);
    expect(out.metadata?.meal_session_ids).toEqual(["sess-1", "sess-2"]);
  });
});
