import { beforeEach, describe, expect, it, vi } from "vitest";

import { composePillarPlanReply } from "./composePillarPlanReply.js";
import type { PillarExecutionPlan, PlanStepResult } from "./types.js";

const createMock = vi.fn();

vi.mock("../../../tools/clients.js", () => ({
  anthropic: {
    messages: {
      create: (...args: unknown[]) => createMock(...args),
    },
  },
}));

vi.mock("../../../meals/mealDaySummary.js", () => ({
  sumMealLogsForDay: vi.fn().mockResolvedValue({
    date: "2026-08-11",
    calories: 694,
    protein_g: 20.2,
    carbs_g: 88.6,
    fat_g: 29,
  }),
}));

describe("composePillarPlanReply multi-meal log", () => {
  beforeEach(() => {
    createMock.mockReset();
  });

  it("uses deterministic compose when meal_log_compose metadata is present", async () => {
    const plan: PillarExecutionPlan = {
      confidence: 1,
      parser: "deterministic",
      steps: [
        { capability: "meal_log", args: { meal_text: "tea" } },
        { capability: "meal_log", args: { meal_text: "lunch" } },
      ],
    };
    const steps: PlanStepResult[] = [
      {
        step_index: 0,
        capability: "meal_log",
        text: "**Breakfast logged**\n~90 kcal",
        metadata: {
          meal_session_id: "sess-1",
          meal_log_compose: {
            mealSlot: "breakfast",
            headline: "Breakfast — tea",
            totals: { calories: 90, protein_g: 2.5, carbs_g: 14, fat_g: 2.5 },
          },
        },
      },
      {
        step_index: 1,
        capability: "meal_log",
        text: "**Lunch logged**\n~514 kcal",
        metadata: {
          meal_session_id: "sess-2",
          meal_log_compose: {
            mealSlot: "lunch",
            headline: "Lunch — parathas",
            totals: { calories: 514, protein_g: 15.2, carbs_g: 60.6, fat_g: 24 },
          },
        },
      },
    ];

    const text = await composePillarPlanReply(
      {
        userProfileId: "u1",
        telegramUserId: "t1",
        rawMessage: "breakfast tea, lunch parathas",
        intent: "HEALTH",
      },
      plan,
      steps,
    );

    expect(text).toContain("Logged this turn");
    expect(text).toContain("Today (on file):** 694 kcal");
    expect(createMock).not.toHaveBeenCalled();
  });
});
