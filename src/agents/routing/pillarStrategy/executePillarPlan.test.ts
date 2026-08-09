import { beforeEach, describe, expect, it, vi } from "vitest";

const composeMock = vi.fn();

vi.mock("./composePillarPlanReply.js", () => ({
  composePillarPlanReply: (...args: unknown[]) => composeMock(...args),
  formatPriorStepContext: () => "",
}));

vi.mock("./executePlanStep.js", () => ({
  executePlanStep: vi.fn().mockResolvedValue({
    text: "Specialist raw output.",
    metadata: { specialist: "Test", pillar_compose: true },
  }),
}));

vi.mock("./parsePillarStrategy.js", () => ({
  pillarPlanComposeEnabled: () => true,
}));

import { executePillarPlan } from "./executePillarPlan.js";

describe("executePillarPlan", () => {
  beforeEach(() => {
    composeMock.mockReset();
    composeMock.mockResolvedValue("Magnus composed.");
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
});
