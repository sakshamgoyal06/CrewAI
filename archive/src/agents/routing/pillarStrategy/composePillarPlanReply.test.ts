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

describe("composePillarPlanReply", () => {
  beforeEach(() => {
    createMock.mockReset();
  });

  it("composes single-step specialist output via LLM", async () => {
    createMock.mockResolvedValueOnce({
      content: [{ type: "text", text: "Here is your plan for Monday." }],
    });

    const text = await composePillarPlanReply(
      {
        userProfileId: "u1",
        telegramUserId: "t1",
        rawMessage: "show plan",
        intent: "HEALTH",
      },
      { steps: [{ capability: "meal_plan_read", args: {} }], confidence: 1, parser: "llm" },
      [{ step_index: 0, capability: "meal_plan_read", text: "Plan for Monday…", metadata: {} }],
    );
    expect(text).toBe("Here is your plan for Monday.");
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it("composes multi-step outcomes via LLM", async () => {
    createMock.mockResolvedValueOnce({
      content: [{ type: "text", text: "Here is your plan and shopping list combined." }],
    });

    const plan: PillarExecutionPlan = {
      confidence: 0.9,
      parser: "llm",
      steps: [
        { capability: "meal_plan_read", args: {} },
        { capability: "meal_plan_shopping_list", args: {} },
      ],
    };
    const steps: PlanStepResult[] = [
      { step_index: 0, capability: "meal_plan_read", text: "Mon: curry", metadata: {} },
      { step_index: 1, capability: "meal_plan_shopping_list", text: "- rice\n- lentils", metadata: {} },
    ];

    const text = await composePillarPlanReply(
      {
        userProfileId: "u1",
        telegramUserId: "t1",
        rawMessage: "plan and shopping list",
        intent: "HEALTH",
      },
      plan,
      steps,
    );

    expect(text).toBe("Here is your plan and shopping list combined.");
    expect(createMock).toHaveBeenCalledTimes(1);
  });
});
