import { beforeEach, describe, expect, it, vi } from "vitest";

const parseMock = vi.hoisted(() => vi.fn());
const executeMock = vi.hoisted(() => vi.fn());
const hintsMock = vi.hoisted(() => vi.fn());

vi.mock("../routing/pillarStrategy/buildRoutingHints.js", () => ({
  buildRoutingHints: (...args: unknown[]) => hintsMock(...args),
}));

vi.mock("../routing/pillarStrategy/parsePillarStrategy.js", () => ({
  parsePillarExecutionPlan: (...args: unknown[]) => parseMock(...args),
}));

vi.mock("../routing/pillarStrategy/executeHappinessStrategy.js", () => ({
  executeHappinessStrategy: (...args: unknown[]) => executeMock(...args),
}));

import { HAPPINESS_SYSTEM, runHappinessAgent, happinessAgent } from "./happinessAgent.js";

describe("happinessAgent", () => {
  beforeEach(() => {
    parseMock.mockReset();
    executeMock.mockReset();
    hintsMock.mockReset();
    hintsMock.mockResolvedValue({});
  });

  it("exports HAPPINESS_SYSTEM with list and YouTube boundaries", () => {
    expect(HAPPINESS_SYSTEM).toMatch(/watchlist|saved list/i);
    expect(HAPPINESS_SYSTEM).toMatch(/cannot browse the web/i);
    expect(HAPPINESS_SYSTEM).toMatch(/invent\s+list rows/i);
  });

  it("registers as HAPPINESS department agent", () => {
    expect(happinessAgent.departmentId).toBe("HAPPINESS");
    expect(happinessAgent.name).toBe("Happiness");
  });

  it("runHappinessAgent parses plan and executes happiness strategy", async () => {
    const plan = {
      steps: [{ capability: "leisure_recommendation", args: {} }],
      confidence: 1,
      parser: "llm" as const,
    };
    parseMock.mockResolvedValue(plan);
    executeMock.mockResolvedValue({
      text: "Try a quiet film tonight.",
      metadata: { specialist: "Happiness" },
    });

    const ctx = {
      userProfileId: "u1",
      telegramUserId: "t1",
      rawMessage: "Something light to watch?",
      intent: "HAPPINESS" as const,
    };

    const out = await runHappinessAgent(ctx);
    expect(parseMock).toHaveBeenCalledWith("HAPPINESS", ctx.rawMessage, {});
    expect(executeMock).toHaveBeenCalled();
    expect(out.text).toContain("quiet film");
  });
});
